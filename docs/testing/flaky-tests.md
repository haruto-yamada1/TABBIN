# flaky test の監視と切り分け

Issue #939 の診断経路。CI の unit shard、coverage、IndexedDB browser semantics、
accessibility E2E と、実行された Firefox startup smoke の観測を収集する。
元のテストコマンドと coverage threshold は blocking のままで、
`Flaky Test Diagnostics` だけが advisory job になる。
失敗したテストを retry、sleep、timeout 延長で成功扱いにしない。

## CI で見るもの

Actions run の `Flaky Test Diagnostics` の step summary、または
`flake-summary` artifact 内の `report.md` / `summary.json` を確認する。
テストごとの実行回数、成功・失敗・skip、retry、所要時間、環境と、
直近の保持された観測に基づく候補が記録される。

- 同じテストが retry 前に失敗し、その後成功した場合は flaky 候補。
- 同一の tested commit / 環境で別 run の成功と失敗が混在する場合も flaky 候補。
  異なる commit の成否の差はこの判定に使わず、変更内容と照合する。
- 最終失敗が別 run でも繰り返す場合は regression 候補。再現前に断定しない。
- setup error、browser install、runner 中断、reporter 未完了、履歴取得の失敗、
  観測不足は unknown / 未確認として扱う。失敗理由を見ずに infrastructure
  起因と断定しない。skip や実行されていないジョブを成功に数えない。

Firefox smoke は既存の実行条件を維持する。通常の push / pull request では
skip され、その回の観測には含まれない。独自の Firefox IndexedDB migration
smoke script は Vitest / Playwright の reporter 対象外であり、元の job log と
専用の smoke 結果で確認する。

履歴は同じ repository の読み取り専用 Actions API から、現在の run を除き、
push / develop の baseline と同じ PR の直近 14 日を対象にする。
最大 25 runs / 50 artifacts、圧縮済み取得合計 30 MiB、正規化 report ごと 5 MiB
に制限する。取得不能・期限切れ・件数制限・途中で打ち切った履歴はその制約を
summary に残す。
展開後の正規化 JSON も合計 30 MiB に制限し、期限切れ数を別に表示する。
表示される傾向は保持期間内に収集できた標本であり、全 CI 履歴の failure rate
や母集団全体の信頼性を示すものではない。

flake rate は (retry 成功数 + 同一 SHA で pass が観測された最終失敗数) /
実行数。`retryRecoveryRate` は retry 成功数 / 実行数を別に残す。
skip / 中断 / expected failure は分母に数えず、分母が 0 の率は unknown とする。
同じ run の再実行は suite ごとに最新の観測だけを数える。

## 保存するデータと証拠

各テストジョブは `FLAKE_REPORT_PATH` と安定した `FLAKE_SUITE` を指定し、
`flake-current-<job>` artifact としてその 1 個の正規化 JSON だけを 14 日保存する。
test identity は runner / repository-relative file / project / full title の
SHA256。raw title、error、stack、stdout、任意の添付データを JSON に保存しない。
ファイル名は `src/`、`tools/`、`e2e/` などの静的な repository-relative test path
に限定し、ローカルの絶対パスやユーザーデータを保持しない。
run / commit と OS、Node major / runner version を使って条件を比較する。
branch / PR の選別は履歴取得時に行う。

Vitest の attempt duration は reporter が観測する body / beforeEach / afterEach
の区間を対象とし、aroundEach、fixture cleanup、retry 間の待機は含まれない。
物理的な各試行と framework の最終成否を分けて保存し、
repeats の途中失敗を最後の成功で打ち消さない。最終のテスト結果と照合するが、実行全体の wall-clock duration とは異なる。
同名テストは同名内の出現順も hash に含め、別の観測として保持する。
同名群を並べ替えた場合は ID の対応をソースで再確認する。
runner が中断して final result が届かない場合などは、不完全な観測として扱う。

Playwright は既存の `on-first-retry` trace を維持する。
browser job の evidence checker は `test-results/` 内の `trace.zip`、`.png`、
`.webm` のみを対象にし、合計 50 MiB / 2000 files の上限を確認する。
対象がない、上限超過、symlink など不適切な状態では保存せず、理由を log に残す。
許可された証拠だけを `flake-evidence-<job>` に 7 日保存し、HTML report、raw JSON、
error log、`test-results/` 全体は artifact にしない。
trace / screenshot にはテストが使う画面や URL が含まれ得るため、
fixture は人工データを使い、実利用者のタブ・バックアップ・認証情報を投入しない。

失敗後も `!cancelled()` で観測の upload と summary を実行する。
収集失敗はテスト失敗の根拠を置き換えない。fork PR は `contents: read`、
集計ジョブだけ `actions: read` を使う。追加 secret、write permission、
`pull_request_target`、`workflow_run`、コメント投稿は使用しない。

## 候補だけを再現する

summary の test ID と file を起点に、対象ファイルのテスト名をローカルで確認する。
hash は機微な title を公開しないための識別子なので、hash 自体を test filter にしない。
全スイートを何十回も回さず、まず該当テストのみに絞る。
Node / Bun は `.node-version` / `.bun-version` に揃え、CI と同じ commit、project、
OS / browser 条件を優先する。

Vitest は既存の繰り返し用 script に file と `--test-name` を渡す。
test name は Vitest の regex なので、必要に応じて記号を escape し、対象名に絞る。

```sh
bun tools/scripts/test-flake.mjs src/lib/example.test.ts \
  --repeat 20 --project node --test-name '^対象のテスト名$'
```

Playwright は file と `--grep` に絞って 20 回実行する。
初回失敗を見える形に保つため、診断時は retry を無効にする。

```sh
bunx playwright test e2e/example.spec.ts --project=extension \
  --grep '^対象のテスト名$' --repeat-each=20 --workers=1 --retries=0
# IndexedDB の候補は専用 config を使う。
bunx playwright test e2e/example.spec.ts --config=playwright.indexeddb.config.ts \
  --grep '^対象のテスト名$' --repeat-each=20 --workers=1 --retries=0
```

実在する候補の file / title / project に置き換える。
失敗が単独では再現しない場合は、shared state、並列実行、テスト順序の依存を調べる。
runner setup の問題は browser install / 起動などの job log と環境で確認する。
UI の待機は observable な状態に合わせ、固定 sleep を追加しない。

## 担当と対応期限

新規候補は対象テストの CODEOWNERS、導入 PR の作者、該当領域の maintainer の順に
担当を決める。2 営業日以内に regression / flaky / setup・環境 / 未確認を評価し、
flaky と確認したものは原則 7 日以内に修正または修正計画を決める。
初回から保存データ・permission・security・release の重要経路に影響する場合、
または同じ test ID で別 run に再発した場合は Issue 候補として報告する。
Issue の作成はユーザーの明示依頼で行う。

Issue には test ID / file、run URL、commit、環境、観測回数と制約、再現コマンド、
根本原因の仮説、担当・期限・検証条件を記載する。raw title / error に機微な入力が
含まれないことを確認し、必要な証拠だけを参照する。
修正は shared state の隔離、async cleanup、明示的な状態待機など原因に合わせる。
retry 回数、sleep、timeout、skip の追加だけで候補を消す対応はしない。

## ローカルで集計・検証する

人工データで取得した正規化結果、または Actions の正規化 artifact を使う。

```sh
gh run download <run-id> --pattern 'flake-current-*' --dir reports/flakes/current
flake_history_dir=$(mktemp -d)
bun tools/testing/fetch-flake-history.ts "$flake_history_dir"
bun tools/testing/report-flakes.ts \
  --current reports/flakes/current --history "$flake_history_dir" \
  --output reports/flakes
bun run test:node -- tools/scripts/flaky-workflow.test.ts tools/testing
bun run ci:lint .github/workflows/ci.yml
bun run ci:security .github/workflows/ci.yml
```

履歴取得は `GH_TOKEN` と標準の `GITHUB_REPOSITORY` / `GITHUB_RUN_ID` を参照する。
履歴取得先は毎回空の専用 directory を使い、古い観測を混ぜない。
run ID / event / suite / source HEAD / attempt を Actions API と照合する。
PR では source HEAD と tested merge SHA が異なるため、両方を保存する。
ローカル実行時も対象 repository / run を明示し、token は shell 履歴やログに書かない。
集計結果は `summary.json` と `report.md` に保存し、CI では `GITHUB_STEP_SUMMARY`
にも追記する。診断経路を rollback するときは CI の収集・集計 step と
`FLAKE_REPORT_PATH` / `FLAKE_SUITE` を取り除く。元の blocking test command と
既存 retry / trace policy はそのまま維持する。

## Case study: `SubCategoryKeywordManager` rename input

The rename input was focused and selected with `requestAnimationFrame` in the
parent component. This scheduled selection could run while `userEvent.type`
was typing in the same input, causing the first typed character to be selected
and overwritten by the next keystroke. The saved result was then missing the
first letter.

The fix moved focus and selection into the input component itself:

- The input is focused on mount with `useEffect`.
- `onFocus` selects the current value.
- The parent no longer schedules selection with `requestAnimationFrame`.

This keeps the selection deterministic and prevents it from racing with
`userEvent.type`.
