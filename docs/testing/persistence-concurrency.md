# IndexedDB 並行操作の回帰検証

Issue [#885](https://github.com/haruto-yamada1/TABBIN/issues/885) は、既存の
transaction / revision 比較 / IntegrityChecker を使い、複数 writer の操作が
重なる境界を固定シナリオで検証する。新しい queue や自動 retry は追加しない。
[#938 の逐次 state model](./persistence-model.md) と併用する。

## 契約とシナリオ

`concurrentPersistenceRegression.test.ts` は、同じ DB を開く独立した
`IndexedDbConnectionManager`、実 UnitOfWork、実 session、background data plane
を使う。commit を一度だけ待機させるテスト用 barrier は、snapshot の読み取りと
write plan の生成が済んだ位置で停止する。解除後は本来の IndexedDB transaction
をそのまま実行する。timer や実行速度に依存して競合を起こさない。

| 操作                               | 観測する結果                                                                                                                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 同じ revision から同じ URL を保存  | 先の transaction だけが成功し、後の保存は `PersistenceRevisionConflictError`。拒否後の DB 全体と revision は成功直後と同一。明示的な再試行では最新の URL ID を保持し、重複を作らない。                               |
| 削除と別 context の保存            | 古い削除 plan は他 context の更新後に拒否される。最新状態から再試行すると、後から保存した URL を保持して対象だけを削除する。                                                                                         |
| Undo と別 context の保存           | 古い復元 plan は拒否される。明示的な Undo 再試行は既存仕様どおり savedTabs 全 snapshot を metadata とともに復元する。削除後に追加した URL もその snapshot の対象外になる。                                           |
| Import と処理中の保存              | 公開 Backup V2 use case と実 replacement が一括置換を完了すると、置換前の revision を使う保存は拒否される。再試行は Import 済みの内容を読み直し、それを保って追加する。                                              |
| unique index で transaction が失敗 | 他 context の保存を待機させたまま複数 store の更新・削除を失敗させ、全 snapshot と revision が元に戻ることを確認する。待機中の正常な保存は成功し、接続を全て閉じて再生成した writer から修正済み操作を再実行できる。 |

各観測点で `checkPersistenceIntegrity` を再利用する。成功件数だけでなく、
拒否された操作の部分書き込みがないこと、revision の増分、URL / Collection /
Membership の内容、Undo と Import の全 metadata を照合する。

テストの検出力は、隔離 worktree で revision 比較を一時的に除く pressure check
でも確認する。この変更で保存・削除・Undo・Import の競合テストが失敗し、
比較を復元すると同じ suite が通過する。さらに、制約違反より先に成功する
category put を別 transaction で確定させる故障注入で、部分書き込みの漏れを
検出する。元の一括 transaction に戻すと通過する。本番コードに故障注入を残さない。

## 実行

`.node-version` / `.bun-version` に従い、依存を frozen lockfile で導入する。

```bash
bun install --frozen-lockfile
bun run test:node -- src/contexts/saved-tabs/infrastructure/persistence/concurrentPersistenceRegression.test.ts
bun run test:indexeddb:browsers
```

node の回帰テストは通常の `bun run test` と quality gate に含まれる。
`e2e/indexeddb/concurrent-persistence.spec.ts` は同一 origin の 2 ページから
実 application use case / IndexedDB adapter を呼び、競合拒否、明示的な再試行、
writer ページを閉じて再生成した後の読み戻し、unique index 失敗の rollback を
Chromium / Firefox で検証する。成功した commit の通知 revision も照合する。

`e2e/persistence-worker-restart.extension.spec.ts` は本物の Chrome MV3 拡張を
起動し、background 削除の完了後に対象 worker を CDP で停止する。CDP の
`runningStatus=stopped` を待ち、runtime message で自動的に再起動させる。
再起動前に設定した global marker が消え、保存 snapshot / revision が保持され、
次の background 削除とページ reload が成功することを確認する。
Chrome は DevTools target を維持することがあるため、Playwright の Worker
オブジェクトの同一性や `close` event を再起動の判定条件にしない。

```bash
bunx playwright test --project=extension e2e/persistence-worker-restart.extension.spec.ts
bun run e2e
```

既存 CI の `indexeddb-browser-semantics` job は両 browser の suite と MV3 テストを
順に実行する。MV3 の output は `test-results/mv3-worker` に分離し、先に実行した
browser suite の flake report を消さない。2 つの normalized report は別々の
`flake-current-*` artifact として収集し、テストの失敗は従来どおり blocking とする。
診断には synthetic fixture のみを使い、実ユーザーの URL / title / Backup を
投入しない。

## 範囲の境界

fake-indexeddb での接続再生成は writer のメモリ状態に依存しない保存を検証する。
実 Chrome の MV3 lifecycle と Firefox の IndexedDB 実装は、実 browser の
テスト結果を別に確認する。quota / eviction や OS crash 後の durability は
この suite の保証には含まれない。

Import のテストは IndexedDB の原子的な置換と stale writer の拒否を検証する。
別 storage engine の userSettings との原子性は保証しない。
複数画面の UI 表示、通知の逆順・重複・欠落からの収束は
[#902](https://github.com/haruto-yamada1/TABBIN/issues/902)、破損データの診断 UI
と修復導線は [#903](https://github.com/haruto-yamada1/TABBIN/issues/903) に分ける。
