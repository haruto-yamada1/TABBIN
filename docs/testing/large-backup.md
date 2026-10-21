# 巨大 Backup V2 のブラウザ回帰検証

Issue [#904](https://github.com/haruto-yamada1/TABBIN/issues/904) の測定手順。
production code、resource policy、UI は変更せず、実データサイズの不足テストを追加する。

## 既存の保証との差分

起点は `develop` の `18412755b7f434d720b6383be917e02b3fcba09f`。
Issue 本文とコメント、完了済み #373 / #885 / #905、以下の現行実装を確認した。

| 既存の保証                                                   | 実装・テスト                                                                                         | 今回追加する証拠                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| #373: FileReader 起動前のサイズ拒否、preview、置換確認、復旧 | `ImportFileDialog.tsx`、`ImportExportSettings.test.tsx`、`optionsBackupRecovery.integration.test.ts` | 実際に 128 MiB 直下の File を読み、parse/schema/resource 検証する      |
| resource policy の上限・上限+1                               | `backupResourcePolicy.test.ts`、`BackupV2ResourceUsage.test.ts`                                      | 実配列 100,000 / 100,001 URL と実測 UTF-8 bytes                        |
| #885: revision conflict、複数 store の原子的 rollback        | `concurrent-persistence.spec.ts`                                                                     | 大量 URL 書込の途中で native transaction を abort する                 |
| #905: 容量不足、復旧と明示的 retry、private data の非露出    | `storage-failure.spec.ts`                                                                            | 大量 import の復旧前・復旧後・再試行後の native persistence を検査する |

上限の source of truth は `src/lib/persistence/backupResourcePolicy.ts`。
現在は serialized **128 MiB**、URL **100,000**、membership **500,000**。
以前の値や Issue の提案を新たな上限として扱わない。

## 実行

Node 24.x / Bun 1.3.14、インストール済みの Playwright Chromium / Firefox を使う。
OS の `ps -axo pid=,ppid=,rss=` を使用できる macOS / Linux が測定対象。

```sh
bun install --frozen-lockfile
bun run test:indexeddb:browsers e2e/indexeddb/large-backup.spec.ts --reporter=json > /tmp/large-backup-results.json
# 関連する既存の native IndexedDB 回帰も含めて検証する
bun run test:indexeddb:browsers
```

各 test result の `large-backup-measurement` attachment に、bytes、件数、経過時間、
RSS、runtime 情報が入る。JSON reporter では attachment の `body` は base64。
合成 JSON はブラウザ内で生成し、巨大 fixture や実際のユーザーデータをリポジトリへ保存しない。

## シナリオと検査境界

1. 134,217,727 bytes（128 MiB - 1 byte）。128 URL / membership の notes を、
   各 notes の上限内で埋める。空白 padding や偽装した `File.size` を使わず、
   native FileReader → production import gate → resource collector を通す。
   preview の検査なので永続化状態が全く変わらないことも確認する。
2. 100,000 の一意 URL / membership。FileReader → production gate → resource 検証 →
   production import use case（保護 snapshot、native replacement、settings、verified readback）
   を通す。接続を close / reopen して件数、先頭・末尾 ID、integrity を確認する。
3. 実配列 100,001 URL。`BACKUP_RESOURCE_LIMIT_EXCEEDED` として保存前に拒否する。
4. 大量 JSON の末尾切断、および最後の URL の title 型不正。
   `INVALID_BACKUP` として保存前に拒否する。
5. 100,000 URL の replacement 中、5,000 件の native URL request が成功した時点で
   transaction を abort。categories、groups、analytics、chat、既存 URL を含む seed と比較する。
   **復旧が始まる前**にも close / reopen して全 store と revision の rollback を確認する。
   保護 snapshot 保存と復旧による revision 増加・通知は区別し、import 成功通知が出ないこと、
   settings が変わらないこと、明示的な再試行が成功することまで検査する。
   `completedUrlWrites` の 5,002 は abort 前の 5,000 と復旧時の 2 件の合計。

全ケースで console / pageerror と戻り値に private marker が漏れないことを検査する。
エラーメッセージや payload を測定 attachment へ保存せず、安全な code / phase だけを返す。
データ処理は通常ページ内で production module を bundle して実行し、native IndexedDB を使う。
settings backend と storage estimate は test 用の代替で、実際の quota 枯渇の測定ではない。
拡張 UI の preview 操作、OS によるプロセス強制終了、電源断の再現はこのテストの対象外。

## 測定の読み方

- `readMs`: native FileReader による読込。fixture 生成時間を含まない。
- `parseSchemaMs`: production gate による JSON.parse と strict schema 検証の合計。
- `resourceMs`: 実配列件数と UTF-8 resource 集計・検証。
- `overwriteMs`: preflight、保護 snapshot、native replacement、settings、readback、通知を含む。
- `failedPhaseMs`: 拒否された phase の時間。abort の場合は rollback 確認と復旧も含む。
- RSS: 専用ブラウザ PID とその子孫の resident bytes を約 100 ms 間隔で合計する。
  baseline は小さな seed の保存後、最大観測値は fixture 生成から測定終了まで。
  runner / Node の RSS は含めない。共有ページの重複計上、GC、sampling 間隔の影響があるため、
  正確な heap size や瞬間 peak、確保量、メモリリークの証明ではない。

所要時間と RSS は環境依存の観測値として保存し、根拠のない固定 SLO は追加しない。
大量の native 書込・復旧・retry は手元で既定 30 秒に近づいたため、この2ケースだけ
Playwright の `test.slow()`（通常 timeout の3倍）を指定する。

## rollback 回帰の検出力

production replacement の `analyticsViews.clear()` を、同じ transaction に加えて
別の readwrite transaction でも実行する故障を一時的に注入した。
中断テストは、復旧前の snapshot で `seed-view` が消失したことを検出して失敗した。
最終状態の復旧成功だけでは見落とす非原子的な変更も検出できる。
注入後は production source を元の bytes へ戻し、通常の全ブラウザ検証を再実行する。

## 測定結果

2026-10-18 07:20 JST、macOS arm64 / Apple M4 / 16 GiB、Node 24.17.0、
Bun 1.3.14、Playwright 1.63.0。Chromium 153.0.8010.12 / Firefox 155.0。
1 worker で既存回帰を含む **60 passed / 0 failed / 0 skipped / 0 flaky**（85.8 秒）。
各シナリオ1回の観測で、他環境への性能保証や改善前後の比較ではない。

生の数値と runtime 情報は [large-backup-baseline.json](./large-backup-baseline.json) を参照。
100,000 URL の入力は 45,537,286 bytes（約43.4 MiB）。
下表の時間は ms、RSS は MiB（baseline → 最大観測値）。`—` はその phase を実行しないか、
拒否前に完了していないことを示す。「置換/拒否」は `overwriteMs` または `failedPhaseMs`。

| Browser  | ケース                 |  Read | Parse+schema | Resource | 置換/拒否 |            RSS |
| -------- | ---------------------- | ----: | -----------: | -------: | --------: | -------------: |
| chromium | 128 MiB - 1 byte       | 123.1 |         70.2 |    176.5 |         — | 279.2 → 1565.9 |
| chromium | 100,001 URL 拒否       |  38.1 |        151.5 |        — |     213.9 |  279.2 → 673.9 |
| chromium | 末尾切断               |  36.1 |            — |        — |      56.4 |  279.3 → 647.4 |
| chromium | 末尾の型不正           |  36.6 |            — |        — |     150.8 |  279.4 → 648.5 |
| chromium | 100,000 URL 置換       |  38.5 |        149.7 |    209.0 |    6882.7 | 278.2 → 2175.1 |
| chromium | 5,000 件で abort・復旧 |  28.0 |        149.1 |    212.9 |    5359.5 | 279.1 → 2505.8 |
| firefox  | 128 MiB - 1 byte       | 106.0 |         72.0 |     64.0 |         — | 970.4 → 2245.3 |
| firefox  | 100,001 URL 拒否       |  27.0 |        296.0 |        — |      34.0 | 966.6 → 1244.5 |
| firefox  | 末尾切断               |  25.0 |            — |        — |     106.0 | 965.3 → 1236.1 |
| firefox  | 末尾の型不正           |  24.0 |            — |        — |     294.0 | 965.7 → 1243.2 |
| firefox  | 100,000 URL 置換       |  24.0 |        295.0 |     31.0 |   12203.0 | 991.0 → 2554.5 |
| firefox  | 5,000 件で abort・復旧 |  25.0 |        295.0 |     32.0 |   10259.0 | 966.3 → 2498.8 |

128 MiB 直下の入力でもブラウザツリーの RSS 増加は約1.2 GiB、100,000 URL の
置換では最大観測 RSS が約2.1–2.5 GiBになった。ファイルサイズ上限だけから必要なメモリは
推定できない。現行処理の複数回の schema 検証・serialize・readback と fixture 自体の生成が
共存するため、この値だけから単一の関数を原因と判断しない。
今回の範囲は測定と回帰検証で、メモリ最適化や新しい中断UIの実装は含めない。

## 通常の拡張 E2E

`bun run e2e` は 55 passed / 3 failed。失敗した以下の3ケースは、
同じ起点 SHA の変更なし detached checkout でも同じ理由で再現した。

- `e2e/extension-entrypoints.story.spec.ts` の analytics drilldown:
  `getByText('docs.example.com')` が2要素に一致する strict mode violation。
- `e2e/ollama-connection.extension.spec.ts` の `127.0.0.1` / `localhost` の2ケース:
  `Ollama connection verified.` が表示されない。

基点での再現 command:

```sh
bun run e2e e2e/extension-entrypoints.story.spec.ts e2e/ollama-connection.extension.spec.ts --grep 'analytics でチャートをクリック|を保存・再読み込み' --reporter=line
```

今回の追加は native IndexedDB 用 config で実行するテストと文書のみで、これらの失敗には
変更を加えない。通常 E2E 全体が成功したという主張はしない。
