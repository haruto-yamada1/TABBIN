# Persistence v2 緊急対応 runbook

## 適用範囲と不変条件

この runbook は、Issue #729 の cutover release が一度でも配布された後の
Persistence v2 障害に適用する。cutover 後は、アプリケーションのバージョンと
永続化データの世代を別々に扱う。

- アプリケーション rollback は、互換性を証明した Persistence v2 runtime への
  切り戻しだけを意味する。
- データ rollback は、Backup V2 または recovery snapshot を明示的に復元する操作を
  意味し、通常のアプリケーション rollback には含めない。
- pre-IDB runtime への downgrade、legacy storage への fallback、dual-write は禁止する。
- cutover 後 30 日間の legacy data 保持は recovery evidence であり、rollback source
  ではない。
- 過去の git tag はコードの位置を示すだけで、その artifact が現在の IndexedDB
  generation を安全に読み書きできる証明にはならない。

原則は **forward-fix** である。古い git tag や Store 上の旧 artifact を「安全な
rollback」と推測して配布してはならない。

pre-IDB artifact は v2 marker を読む処理自体を持たないため、startup guard を
retroactive に追加できない。現在の v2 runtime は generation が欠落・不正な control
state を fail closed にするが、旧 artifact の再配布防止は release verifier と
checklist を必須の保護境界とする。

## 障害時の操作マトリクス

`read-only-emergency` は、既存データを保持しながら追加破損を止めるための
fail-closed 状態である。

| 操作                                 | 許可 | 備考                                                         |
| ------------------------------------ | ---- | ------------------------------------------------------------ |
| 既存 URL、カテゴリ、notes の読み取り | 可   | control state が宣言した source だけを読む                   |
| Backup V2 export                     | 可   | settings の正規化 repair を含め、永続化 write を発生させない |
| URL 保存、削除、並べ替え             | 不可 | IndexedDB write gate が拒否する                              |
| カテゴリ、notes の変更               | 不可 | IndexedDB write gate が拒否する                              |
| Backup V2 / legacy backup の import  | 不可 | settings-only import も拒否する                              |
| restore、repair、cleanup、migration  | 不可 | emergency 中はデータ形状を変更しない                         |

export が失敗した場合も write-disable を解除しない。原因を記録し、読み取り専用の
診断または forward patch で export path を回復する。

利用者へは、データを失ったと誤認させず、次の意味を明示する。

> データ保護のため、一時的に編集を停止しています。保存済みデータの閲覧と
> バックアップは利用できます。

## `read-only-emergency` の開始と解除

1. 現在の control state、`migrationId`、`persistenceGeneration`、artifact version を
   記録する。
2. typed control-plane transition で `read-only-emergency` に入る。IndexedDB source
   では `migrationId` と `persistenceGeneration: 2` を保持する。
3. `chrome.storage.local` の control record を手動編集しない。
4. write refusal と Backup V2 export success を確認する。
5. forward patch を配布し、migration / integrity / query / mutation fixture を確認する。
6. 入場時と同じ `migrationId` を指定した typed transition だけで emergency を解除する。
7. 解除後に control state と通常 write の smoke test を再確認する。

`migrationId` が一致しない、generation が判定できない、または互換性 metadata が
欠落する場合は解除せず fail closed とする。

## インシデント対応手順

### 1. 障害を分類する

次を分けて記録する。

- read failure / write failure / integrity failure / migration failure
- 影響する persistence generation と IndexedDB database version
- query path、mutation path、settings path、backup path のどれか
- 破損が確認済みか、破損の可能性だけか

### 2. write-disable を判断する

継続 write が原因の拡大、既存データの上書き、または integrity 判断を困難にする
可能性があれば、直ちに `read-only-emergency` へ移行する。迷う場合は write-disable
を選ぶ。

### 3. 現在の generation を保全する

control state と build artifact の `persistence-release.json` を保存し、write を伴わない
Backup V2 export を取得する。pre-IDB storage へコピーして世代を戻す操作はしない。

### 4. 障害範囲を特定する

該当する migration、schema upgrade、query、mutation、serializer、integrity check の
最小範囲を特定する。Store 配布 version と source commit も記録する。

### 5. forward patch を作成する

現在の generation を読み取れる runtime 上で修正する。legacy fallback、dual-write、
未検証の自動 repair を追加しない。

### 6. fixtures と互換性を検証する

実データを匿名化した fixture または同等の migration / integrity fixture で、読み取り、
write refusal、export、修正後 mutation を検証する。下記 checklist と verifier も通す。

### 7. 修正版をリリースする

通常の `bun run release:check` と Store 手順を実行する。emergency を理由に
compatibility metadata や品質 gate を省略しない。

### 8. write-enable する

修正版の適用、control state、integrity check、Backup V2 export を確認してから、
一致する `migrationId` で emergency を解除する。解除時刻と確認結果を incident log
に残す。

## rollback compatibility の判定

配布済み artifact と rollback candidate の両方から、次を確認する。

1. `persistenceGeneration` が同一である。
2. candidate version が配布済み artifact の `minimumCompatibleAppVersion` 以上である。
3. `databaseVersion` が同一である。DB downgrade を伴う candidate は拒否する。
4. 配布済み upgrade に `destructiveSchemaChange` がない。
5. deployed artifact の `databaseDowngradeCompatible` が `true` である。
6. deployed artifact の `queryWriteContractCompatible` が `true` である。

配布 artifact または candidate の metadata が欠落・不正な場合、判定は失敗する。
現在の runtime と同じ generation / DB version で、minimum version 以降の artifact だけが
v2-compatible rollback candidate になり得る。pre-IDB artifact、generation の異なる
artifact、DB version を戻す artifact は incompatible である。

build source の自己整合性は次で検証する。

```bash
bun run verify:persistence-release-compatibility
```

2 つの生成済み artifact を比較する場合は、信頼できる現在の source line から実行する。

```bash
bun run verify:persistence-release-compatibility -- \
  --deployed-dir <deployed-unpacked-extension> \
  --candidate-dir <candidate-unpacked-extension>
```

この verifier は manifest version と `persistence-release.json` の
`minimumCompatibleAppVersion`、`destructiveSchemaChange`、
`queryWriteContractCompatible` を fail-closed で評価する。

## DB upgrade / downgrade compatibility checklist

schema または persistence contract を変更する release ごとに、PR と release log に
以下を記録する。

- [ ] persistence generation を維持するか、意図的に上げるか
- [ ] IndexedDB `databaseVersion` と upgrade path
- [ ] destructive schema change の有無と recovery strategy
- [ ] 新しい `minimumCompatibleAppVersion`
- [ ] 旧 query / write contract との互換性
- [ ] migration / integrity / export fixtures の結果
- [ ] downgrade compatibility の判定結果と候補 version
- [ ] incompatible の場合に `read-only-emergency` と forward-fix を使うこと

この checklist を満たさない artifact は Store にアップロードしない。
