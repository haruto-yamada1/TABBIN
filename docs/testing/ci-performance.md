# GitHub Actions CI の計測と最適化

Issue [#936](https://github.com/haruto-yamada1/TABBIN/issues/936) の計測対象は
`.github/workflows/ci.yml`。アプリ、権限、永続化モデル、coverage threshold は変更しない。

## 再計測

Node / Bun は `.node-version` / `.bun-version` を使い、GitHub の Actions 読取権限を
持つ環境で実行する。認証情報を引数やレポートに含めない。

```sh
bun run ci:performance -- --limit 30 --output reports/ci-performance/baseline.json
bun run ci:performance -- --run-id 123456 --run-id 123457 --output reports/ci-performance/after.json
```

`--run-id` の数値は実際の CI run ID に置き換える。`--branch` でも絞れる。
completed run が指定件数に達しない、jobs pagination が途中で終わる、不正な時刻や
重複 ID がある場合は失敗する。取得不能なログは欠測とし、cache miss に数えない。
生ログ、cache key、token は保存しない。通常出力は ignored な `reports/ci-performance/`
に置き、公開する証拠は run URL / SHA / attempt / 計測値に絞る。

経過時間は run 作成から最後に実行された job の完了まで。初期待ちは run 作成から
最初の job 開始まで。job の待ちは created_at から started_at までで、依存待ちと
runner 待ちを分離できない。runner minutes は実行 job 秒数の合算 / 60。
再実行の比較には latest attempt の `run_started_at` を起点にする
`attemptElapsedSeconds` を使う。初回作成からの elapsed は再実行前の待ちを含むので
同じ指標として比較しない。起点が欠ける場合は欠測にする。
job ごとに分単位へ切り上げた推計も別に出す。請求額や OS 係数、過去 attempt の
実行費用を表すものではない。失敗率は success と failure 系の結論から計算し、
cancelled / skipped を別に示す。Firefox Extension Smoke の skip は成功に数えない。

## baseline と採用理由

2026-10-14 に直近30 completed run を取得した。混在する成功 / 失敗の全体値に加え、
性能比較では成功 run を同じ event / workflow 構成で比較する。失敗で早く終わった run を
性能改善の根拠にしない。baseline の失敗率は変更内容が異なる PR の混合集団であり、
今回の変更による失敗率ではない。

| 対象                  | 変更前の観測                      | 判断                                                                    |
| --------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| 全体経過              | p50 258.5秒、p90 303秒            | coverage が支配。runner minutes 削減と経過時間を分けて評価              |
| Coverage Thresholds   | job p50 250秒、テスト236秒        | 全件 coverage と global / per-glob threshold を維持                     |
| Vitest shard 1/2、2/2 | テスト p50 108秒、67秒            | coverage と同じ全件を重複実行する2 jobを削除                            |
| 型検査                | compile 約5秒、check 内でも再実行 | format:check と lint を直接実行し compile は1回                         |
| 依存導入              | 各 job 中央値約5〜6秒             | Bun cache は転送と保存を含めて比較して採否を決める                      |
| Playwright 導入       | IndexedDB 30秒、a11y 24秒         | binary cache の restore と OS依存導入を合わせて比較                     |
| build / size report   | Verify Build job 中央値32.5秒     | Chrome / Firefox zip 後の size:report は既存成果物の読取。再buildしない |

正式な30件の run / SHA / job / step 集計は
[baseline JSON](ci-performance-baseline.json) に記録した。成功21件だけでは経過時間
p50 264秒 / p90 303秒、実 runner p50 10.6分 / p90 11.85分。全30件の実 runner 合計は
308.35分、job ごと切上げ推計は406分。失敗9件（30%）は他 PR の内容を含む。
baseline 期間中に flake 診断が追加され、30件すべてが同じ job 構成ではない。
そのため after の直接比較には、flake 診断を持つ成功 PR 5件
（38578597319 / 38575566902 / 38572444599 / 38570593357 / 38499051361）も別に示す。
この cohort は elapsed p50 302秒 / p90 332秒、実 runner p50 11.53分 / p90 12.62分、
切上げ p50 15分 / p90 17分。
取得ログは219件、1件は取得不可。baseline の秒境界で step の cache 帰属を確定できない
箇所は unknown に倒し、job 単位の restore 観測と step の hit 率を混同しない。

`Run Vitest Tests` の required check 名は、coverage の成功だけを受け付ける純 shell
集約 job で維持する。coverage が failure / skipped / cancelled なら成功させない。
ruleset [protect-develop](https://github.com/haruto-yamada1/TABBIN/rules/13234086) と
[protect-main](https://github.com/haruto-yamada1/TABBIN/rules/13233876) の必須名
`Lint & Type Check` / `Verify Build` / `Run Vitest Tests` / `React Doctor Score 100`
を2026-10-15に照合した。ruleset 自体は変更しない。
flake の全件観測は `coverage` から収集し、廃止した shard artifact を待たない。

Chrome / Firefox の build、package、size report、source / artifact contract 検証は
維持する。a11y の独立 build を Verify Build の artifact 待ちに変えると critical path と
artifact 転送が増えるため、今回の変更に含めない。ブラウザ job の統合、path filter、
coverage threshold、test retry / worker 数も変更しない。

## cache の試験と判断

最初の比較では IndexedDB Browser Semantics job だけに Bun download cache と
Playwright browser cache を加える。キャッシュするのは配布物のダウンロードであり、
`node_modules` や検証済み成果物は再利用しない。key は OS / architecture / lockfile と
該当 runtime、Bun patch に結び付け、fallback restore key を使わない。

hit / miss のどちらでも `bun install --frozen-lockfile` と
`playwright install --with-deps chromium firefox` を必ず実行する。ブラウザの OS 依存は
cache できない。[Playwright の説明](https://playwright.dev/docs/ci#caching-browsers)も参照。
[GitHub の cache scope](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching#restrictions-for-accessing-a-cache)
により PR の cache は merge ref に閉じる。secret や追加の write permission を使わない。

before / after と cold / warm の実測を記録し、restore / save を足した job 時間で
改善がなければ cache を削除する。全体 wall clock だけで高速化を主張しない。

## 実行と保守の契約

- 連続 push の取消は同じ PR に限定する。push は run ID ごとに group を変え、
  main / develop の実行中・pending run を置き換えない。
- PR は fork / 同一 repository、docs / source / lockfile / workflow の変更を問わず
  同じ gates を実行する。path filter と fork 判定で skip しない。
- coverage / per-glob、Secretlint、audit、typecheck、IndexedDB Chromium / Firefox、
  a11y は blocking。flake 診断だけが従来どおり advisory。
- lockfile と不一致の package fixture を frozen install が拒否することを確認する。
  今回は独立 temp workspace に package.json / bun.lock / patches / legacy-tooling の
  package.json をコピーし、yaml を2.8.2へ変更して `bun install --frozen-lockfile
--ignore-scripts` を実行した。exit 1、`lockfile had changes, but lockfile is frozen`
  を確認した。元の checkout と lockfile は変更しない。
  キャッシュの有無で検証を省略しない。
- workflow 変更時は `ci-performance-workflow.test.ts` と既存の flake / toolchain policy
  テストを実行し、`bun run ci:lint` / `bun run ci:security` / `bun run ci:test` で
  pinned actionlint / shellcheck / zizmor の実診断も確認する。
- 30 run ごとの p50 / p90、runner minutes、失敗率、cache 証拠を成功 cohort で比べる。
  小標本の after は標本数を明示し、原因の異なる失敗や workflow 構成の変更を分離する。
  改善が続かなければ該当する最適化だけを revert し、品質 gate は維持する。
