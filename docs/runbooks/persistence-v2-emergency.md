# Persistence v2 障害復旧 runbook

Issue #861 以降、保存 URL、Collection、Membership、Category、Group、AI 会話履歴、
Analytics Views の正規保存先は IndexedDB のみです。設定・UI 状態の正規保存先である
Chrome Storage は維持します。

旧 Chrome Storage ドメインデータの migration、migration control state、
`read-only-emergency` transition、Legacy emergency backup は廃止しました。
旧フラグを手動編集して復旧する操作や、旧 Chrome Storage ドメインキーへの fallback、
dual-write、全 storage の clear は行いません。未移行ユーザーの旧ドメインデータは
自動復元しません。

## 基本方針

- 既存 IndexedDB データの保全を優先し、DB を削除・初期化してエラーを隠さない。
- DB の open / schema upgrade 失敗時は通常操作を fail closed とし、型付きエラーと
  retry を提示する。retry は接続を開き直し、データの clear や Legacy 復元を行わない。
- record decode / integrity check / revision guard を緩和しない。Integrity error は
  原因調査の対象であり、未検証の自動 repair や破損レコードの読み飛ばしを追加しない。
- `PERSISTENCE_COORDINATION_UNAVAILABLE` では lock の保護を迂回しない。
- 復旧は現在の IndexedDB schema を読む **forward-fix** を基本とする。
- 未解決の DB 障害中に Backup V2 import や recovery snapshot restore を試して
  上書きによる復旧を推測しない。正常に読み取れるデータと recovery artifact を先に保全する。

## 障害別の確認

| 障害                             | 現行の境界と確認                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| DB open failure                  | readiness が操作を拒否する。接続を開き直す retry 後も失敗する場合、ブラウザの保存領域・権限と例外種別を確認する |
| Schema upgrade failure           | upgrade transaction の abort と以前のデータ保全を確認し、forward patch で同じ upgrade を検証する                |
| Version change / blocked upgrade | 旧接続を閉じる lifecycle と別タブの接続を確認する。データ削除や DB version の downgrade はしない                |
| Decode / integrity failure       | 匿名化 fixture で再現し、record validation と参照関係を検査する。空データへの置換で成功にしない                 |
| Revision conflict                | 最新 snapshot を再読み込みして操作を再判断する。旧 revision を無視して commit しない                            |
| Backup import / restore failure  | 変更前の recovery snapshot、DB transaction の atomicity、設定書き込みと rollback の証拠を確認する               |

runtime に全体の編集を停止する旧 control-plane emergency mode はありません。
DB open failure による操作拒否、個々の snapshot integrity admission、transaction の
revision guard をそれぞれ確認します。運用記録を廃止済み state transition と混同しません。

## Backup V2 と recovery snapshot

正常に読み取れる IndexedDB からは現行 Backup V2 を export して保全します。
export は `readUserSettingsWithoutRepair` を使い、設定の repair write を発生させません。
読めない DB や不正な snapshot の export は失敗として扱い、検査を省略して出力しません。

明示された Backup V2 import / restore では、既存の schema validation、resource limit、
JSON-safe boundary、overwrite 前 snapshot capture、transactional replacement を維持します。
internal recovery snapshot は IndexedDB に保存し、最大 2 件・7 日間の既存 retention を
変更しません。設定や UI 状態の Chrome Storage をドメインデータと一緒に消去しません。

Backup V2 には非公開の URL、タイトル、notes、AI の内容が含まれます。保管・共有は
必要な範囲に限定し、Issue / PR / 公開ログに実データを添付しません。診断には安全な
エラーコードと件数、browser / app / DB version を使います。

## インシデント対応手順

1. open、upgrade、read、write、integrity、backup のどの境界で失敗したかを分類する。
   配布 app version、source commit、IndexedDB database version を記録する。
2. 既存データと生成 artifact の `persistence-release.json` を保全する。読み取り可能なら
   write を伴わない Backup V2 export を取得する。DB や Chrome Storage は clear しない。
3. 匿名化した production-shaped fixture で失敗を再現し、最小の原因を特定する。
4. 現在の schema のまま forward-fix を実装し、schema upgrade、integrity admission、
   query、mutation、revision guard、Backup V2 round trip、overwrite recovery を検証する。
5. 下記 rollback metadata と `bun run release:check` を確認して修正版を配布する。
   emergency を理由に release gate や個別の公開承認を省略しない。
6. retry、既存 IndexedDB プロファイルの restart/update、Chrome / Firefox smoke test、
   保存・編集・削除と Backup V2 export を確認し、復旧結果を incident log に記録する。

## Rollback compatibility の判定

pre-IDB artifact への rollback は認めません。現在の IndexedDB データを読めない旧版への
退避や、Chrome Storage へコピーして世代を戻す操作は復旧方法ではありません。
`git tag` だけで互換性を判断せず、配布 artifact と candidate の metadata を比較します。

1. `persistenceGeneration` が同一である。
2. candidate version が配布 artifact の `minimumCompatibleAppVersion` 以上である。
3. `databaseVersion` が同一である。DB downgrade を伴う candidate は拒否する。
4. 配布 upgrade に `destructiveSchemaChange` がない。
5. deployed artifact の `databaseDowngradeCompatible` が `true` である。
6. deployed artifact の `queryWriteContractCompatible` が `true` である。

metadata の欠落・不正、世代・DB version の不一致は fail closed とし、forward-fix を選びます。
これらの条件を満たしても、candidate が既存データを読める fixture の検証を省略しません。

source の自己整合性は次で検証します。

```bash
bun run verify:persistence-release-compatibility
```

生成 artifact の比較は、信頼できる現在の source line から実行します。

```bash
bun run verify:persistence-release-compatibility -- \
  --deployed-dir <deployed-unpacked-extension> \
  --candidate-dir <candidate-unpacked-extension>
```

## DB upgrade / release checklist

- [ ] persistence generation、IndexedDB database version、upgrade path を記録した
- [ ] 既存 IndexedDB データの保全と destructive schema change の有無を検証した
- [ ] `minimumCompatibleAppVersion` と query/write contract compatibility を確認した
- [ ] decode / integrity / revision / export / import / recovery fixture が通った
- [ ] Chrome / Firefox の新規・既存 IndexedDB profile で restart/update を確認した
- [ ] rollback candidate を metadata と fixture で評価し、不適合なら forward-fix とした
- [ ] release gate と Store 公開手順を実行した

この checklist を満たさない artifact は Store にアップロードしません。
