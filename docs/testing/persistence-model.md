# IndexedDB persistence state model

Issue [#938](https://github.com/haruto-yamada1/TABBIN/issues/938) は、保存から
Backup V2 復元までの操作列を fast-check で生成し、各 step の IndexedDB を
独立した参照モデルと照合する。単独の mapper property test は
[property-based-tests.md](./property-based-tests.md) を参照する。

契約の source of truth は
[Persistence Model v2](../architecture/persistence-model-v2.md)、
[IndexedDB persistence](../architecture/indexeddb-persistence.md)、
[Backup schema versioning](../architecture/backup-schema-versioning.md) と
Repository / UseCase の実装である。各 step の参照モデルは、操作と fixture corpus
から期待値を更新し、production mapper を期待値の生成に流用しない。
新規 URL の opaque ID だけを allocation 記録と readback から関連付ける。
以後の ID、URL、title、保存時刻、custom 所属、category はモデル側の期待値を使う。
domain 所属は corpus に別途指定した hostname projection と比較する。
Undo / Backup の全フィールド検査には、操作前の実 snapshot を別の baseline として保持する。

## 不変条件と操作列

テスト入口は
`src/contexts/saved-tabs/infrastructure/persistence/stateful/persistenceStateMachine.test.ts`。
各試行は新しい fake-indexeddb database と固定された synthetic fixture から開始する。
合法な操作に加え、不正 URL の保存 skip、存在しない移動先参照や不正 Backup V2
の拒否も操作列に含める。
各 step 後に保存状態を参照モデルと比較し、`PersistenceIntegrityChecker` を再利用する。

| 契約           | 検証する状態                                                                                                                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exact-url-v1` | 検証済みの元文字列が URL identity。同じ文字列の再保存は canonical URL ID を保持する。query、hash、末尾 slash、hostname case、明示的な default port、前後空白、Unicode / punycode 表記などが異なる文字列は別 URL として扱う。     |
| ID 一意        | entity 種別内の ID、canonical URL identity、Membership の `[collectionId, urlId]` が重複しない。                                                                                                                                 |
| 参照整合性     | Membership の URL / Collection が存在し、category は同じ Collection に属する。Collection の group 参照も存在する。                                                                                                               |
| 保存 / 再保存  | URL の firstSavedAt と ID を保持し、title / lastSavedAt を更新する。domain Membership の addedAt は保持する。background 保存は custom Membership を再作成し、custom-uncategorized 所属・category 未割当・今回の addedAt になる。 |
| 移動 / 削除    | 参照モデルが期待する所属・削除結果と実データが一致し、不正な参照が残らない。拒否される操作は保存状態を変えない。                                                                                                                 |
| Undo           | 削除の Undo は削除直前の savedTabs snapshot 全体と等しくなる。削除後に別 URL を保存した場合も、以前の URL / Collection ID と全 metadata を復元する。                                                                             |
| Backup V2      | Export は状態を変更せず、公開 schema と export 順序を検査する。Import 後の savedTabs は export 直前の baseline と全フィールドで一致する。配列順は独立したソートで比較し、不正な Backup V2 の拒否で既存状態が失われない。         |

故意に URL identity、参照、ID などを壊した synthetic counterexample を検査し、
oracle が不変条件違反を検出することも確かめる。IntegrityChecker が受理する範囲の
timestamp / sortOrder の変更でも、Backup の全フィールド baseline 比較が metadata
損失を検出する。
さらに synthetic DB の title を直接改変し、実際の failure が shrink され、同じ seed
で同じ結果になり、seed / path / replayPath で再現できることを検査する。
失敗した操作列が示す production bug は、対象 module の最小 regression example に昇格させる。

## 操作列から見つかった回帰

test-first の oracle pressure と固定操作列により、次の production boundary を修正した。

- domain Collection を削除後、同じ domain の別 URL を保存し、古い削除を Undo すると、
  UnitOfWork の put-before-delete が domain の unique index に衝突していた。
  同一 transaction 内で delete を先に予約し、その後 put することで古い Collection ID
  を復元する。置換失敗時にも旧 record、index、他 store、revision が戻る regression
  test を `IndexedDbPersistenceUnitOfWork.test.ts` に追加した。
- background の保存・削除境界が `new URL(...).toString()` によって元文字列を
  直列化し、`exact-url-v1` では異なる URL を同一視していた。共有の
  `createUrlIdentityKey` に統一し、元文字列を保持する。model corpus は
  serialization-equivalent な各文字列を独立 slot として持ち、canonical hostname
  による domain projection は URL identity と分けて指定する。

## 実行と再現

`.node-version` / `.bun-version` の runtime と frozen lockfile を使う。

```bash
bun install --frozen-lockfile
bun run test:persistence:model
```

| 環境変数                     | 既定値 | 用途                                                                         |
| ---------------------------- | ------ | ---------------------------------------------------------------------------- |
| `PERSISTENCE_FC_RUNS`        | `100`  | 生成する操作列の試行数                                                       |
| `PERSISTENCE_FC_COMMANDS`    | `40`   | 1 操作列に含める command 数の上限。前提を満たさない command は実行されない。 |
| `PERSISTENCE_FC_SEED`        | 未指定 | fast-check の乱数 seed                                                       |
| `PERSISTENCE_FC_PATH`        | 未指定 | failure の shrink path                                                       |
| `PERSISTENCE_FC_REPLAY_PATH` | 未指定 | stateful commands の実行履歴を表す `replayPath`                              |

失敗ログの seed、path、counterexample 内の replayPath をコピーして再現する。
下記の値は形式を示す例であり、実際の failure の値に置き換える。
元の失敗と同じ commit、依存関係、command 上限を使用する。

```bash
PERSISTENCE_FC_SEED=670108017 \
PERSISTENCE_FC_PATH='96:5' \
PERSISTENCE_FC_REPLAY_PATH='AAAAABAAE:VF' \
bun run test:persistence:model
```

`fc.commands` は、seed と path に加えて commands 側の replayPath を必要とする。
詳細は [fast-check の model-based replay](https://fast-check.dev/docs/advanced/model-based-testing/#replay-model-based-tests)
を参照する。seed だけの指定は同じ生成列の再実行、3 値の指定は shrink 後の
counterexample の再現に使う。

夜間と同じ探索量を local で実行するには:

```bash
PERSISTENCE_FC_RUNS=1000 PERSISTENCE_FC_COMMANDS=100 \
bun run test:persistence:model
```

## CI と診断データ

`.github/workflows/persistence-model.yml` は通常の `pull_request` で 100 試行・
最大 40 commands、毎日 03:41 JST（18:41 UTC）の `schedule` で 1000 試行・
最大 100 commands を実行する。GitHub の schedule は default branch 上で動作する。
`workflow_dispatch` は通常値を既定とし、runs / commands / seed / path /
replay_path を手動指定できる。既存の `bun run test` / quality gate にも同じ
node project のテストが含まれる。

workflow は `contents: read`、SHA 固定 action、checkout の
`persist-credentials: false` を使う。通常の `pull_request` なので fork の変更も
検証でき、secret や GitHub への書き込み権限を必要としない。

generator と command trace は synthetic data のみを使う。failure 診断には
seed / shrink path / replayPath / shrink 回数 / 最小 command trace を残し、
実ユーザーの URL、title、notes、Backup、保存 snapshot を投入しない。
command 表示には操作名と synthetic fixture の識別子を使い、raw URL 内容を
埋め込まない。再現用 Issue / PR にはこの診断値と最小の synthetic fixture を記録する。

## 対象範囲と browser 検証

この suite は単一 context の逐次操作を検証する。transaction 中断、同時実行の
interleaving、writer 再起動は [並行操作の回帰検証](./persistence-concurrency.md)
と実 browser suite で扱う。複数 extension context の UI 同期は
[#902](https://github.com/haruto-yamada1/TABBIN/issues/902) の対象である。破損状態の検出 oracle はここでも使うが、破損をユーザーへ示す UI、
recovery 導線、修復操作は [#903](https://github.com/haruto-yamada1/TABBIN/issues/903)
の対象である。

fake-indexeddb は storage engine の test double であり、Chrome / Firefox の
実装差、quota / eviction、実際の durability、extension lifecycle を証明しない。
既存 browser suite を合わせて確認する:

```bash
bun run test:indexeddb:browsers
bun run test:firefox:indexeddb-smoke
```

Chromium extension の UI / background flow は既存 `e2e/`、Firefox artifact / source
契約は既存 quality / release gate が担当する。state model の成功を browser suite の
成功として扱わない。
