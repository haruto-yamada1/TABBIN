# Firefox Extension Smoke Test

Issue #722 で Chrome / Firefox の runtime 差分を早期検出するための smoke 方針を
定める。Chrome だけ通る変更を release 直前まで放置しないことが目的で、Chrome E2E
をそのまま Firefox へ全複製することは目的にしない。

## Phase 分け

発行時点では Phase 1 / Phase 2 を実装済み。Phase 3 / migration smoke は別 issue で
追加する。

### Phase 1 — Firefox build + manifest validation

`bun run build:firefox` で生成した `.output/firefox-mv2/` を対象に、manifest 契約と
artifact 構造を検証する。

- `tools/scripts/firefoxArtifactContract.ts` が manifest / artifact contract を
  純粋関数として定義し、`tools/scripts/verify-firefox-artifact.ts` が fs を繋いで
  生成物を検証する。
- `tools/scripts/firefox-artifact-contract.test.ts` が helper を vitest で保護する。
- failure を検出する範囲:
  - `manifest_version` が 2 ではなくなる
  - `content_security_policy` が MV3 object 形式に退化する
  - `default_locale` が `ja` 以外になる
  - `options_ui.page` が `options.html` でなくなる
  - required icon size (16 / 32 / 48 / 96 / 128) の欠落
  - Chrome 専用 API permission (`debugger`, `gcm`, `platformKeys`, ...) の混入
  - `browser_specific_settings.gecko.data_collection_permissions.required`
    が `['none']` でなくなる
  - `background.scripts` が空配列 / 非 string array になる
  - 宣言した `background.js` / `options.html` / 各 icon / `_locales/ja|en` 内
    `messages.json` が artifact に物理存在しない
- Chrome / Firefox 間の manifest delta は `manifestSecurityInvariants.ts`
  (`assertChromeFirefoxManifestDelta`) が既に検証しているため、本 helper は
  Firefox artifact 単体の最小 startup contract に集中する。

実行タイミング:

- `bun run quality:check` の中の `bun run test` 経由で helper test が走る。
- `bun run verify:firefox-artifact` を `bun run release:check` が build:firefox 直後
  に呼ぶ。配布 ZIP を作る前に manifest / artifact contract を弾く。
- CI の `verify-build` job が `verify:firefox-artifact` を実行する。push / pull_request
  毎に走り、Firefox artifact の退化を即座に検出する。

### Phase 2 — Firefox startup smoke

Playwright Firefox で実際に Firefox artifact を profile に install し、起動失敗を検出する smoke を用意する。CI の push / pull_request では実行せず、`workflow_dispatch` または `FIREFOX_EXTENSION_SMOKE=1` で実行する manual / nightly gate に置く。

- `e2e/helpers/firefox-extension.ts` が `firefox.launchPersistentContext` で専用 profile を起動し、profile の `extensions/` に Firefox artifact を unpacked copy する。`firefoxUserPrefs` で `extensions.autoDisableScopes = 0` と `xpinstall.signatures.required = false` を立て、`extensions.json` poll で Firefox が割り当てた internal UUID を取り出す。
- `e2e/firefox.extension.smoke.spec.ts` は取り出した UUID で `moz-extension://UUID/options.html` を開き、render を assert する。環境変数がないと skip する。
- `playwright.firefox.config.ts` が smoke 用の単独 config。`workers=1`、`retries: process.env.CI ? 1 : 0`、`trace: 'on-first-retry'` を維持。
- `bun run test:firefox:smoke` で実行。`bunx playwright install firefox` 済みの環境が必要。
- CI は `.github/workflows/ci.yml` の `firefox-extension-smoke` job が `workflow_dispatch` で発火する。push / pull_request では走らない。nightly cron での自動実行は follow-up issue で整備する。

注意: Firefox release build は `xpinstall.signatures.required=false` を無視し、未署名の unpacked extension を弾く。smoke を動かすには Firefox dev / Unbranded build を使うか、TABBIN に `browser_specific_settings.gecko.id` と署名済み XPI を用意する必要がある。`firefoxExtensionUuid` fixture は install 8 秒以内に `extensions.json` に TABBIN entry が現れないと throw し、その error 文に本 constraint を含める。この直しは次周期で扱う follow-up 候補 (Phase 4)。

### Phase 3 — UI / storage smoke + Chrome-only API 静的検出

Phase 3 は Phase 2 の helper を前提に UI と storage read/write の煙を増やし、並行して Chrome 専用 API / `chrome-extension://` literal の混入を source 静的検出する verifier を CI で常時実行する。

#### 3a — production source for static verifier (CI 常時)

`tools/scripts/firefoxSourceContract.ts` が production source (`src/**`、test file / storybook / `src/test/` 除外) で次の違反を純粋関数で collect する:

- `chrome-extension://` literal (Firefox では `moz-extension://` に成るため非移植)
- Firefox で未提供の `chrome.*` API 直接呼び出し (`chrome.debugger` / `chrome.gcm` / `chrome.system.display` / `chrome.platformKeys` / `chrome.printerProvider` / `chrome.fileBrowserHandler` / `chrome.input` / `chrome.ttsengine` / `chrome.tabCapture` / `chrome.pageCapture` / `chrome.identity` / `chrome.vpnProvider` / `chrome.enterprise`)
- `chrome.tabs` / `chrome.storage` / `chrome.runtime` 等 Firefox polyfill 互換の API は許可

`KNOWN_CHROME_EXTENSION_LITERAL_DEBT` allowlist は既存負債 5 file (ai-chat background fallback、OllamaErrorNotice default、userSettingsDefaultsMerge default exclude pattern、i18n messages の placeholder text、urlIdentityCorpus の property-based corpus) を明示。新規追加は verifier が block する。allowlist への追加は同一 PR で該当 file の Firefox 追従を伴う場合のみ。

- `tools/scripts/verify-firefox-source-contract.ts` が fs を繋いで `src/**` を walk して `assertFirefoxSourceContract` を走らせる。
- `tools/scripts/firefox-source-contract.test.ts` が helper を 16 件の vitest で保護する。
- `bun run quality:check` が verifier を走らせ、`bun run release:check` にも組込済み。CI `.github/workflows/ci.yml` の `lint-typecheck` job が `verify:firefox-source` step で常時 enforce。

#### 3b — UI / storage / runtime messaging smoke (gate)

Phase 2 helper が取り出した UUID を使い、TABBIN の「options 画面」「saved-tabs 画面」「storage read/write contract」を verify する smoke を足す。

- `e2e/firefox.extension.ui-smoke.spec.ts` が `moz-extension://UUID/options.html`、`moz-extension://UUID/app.html#/saved-tabs` を page.goto し、title が非空になることで React mount / artifact 完整性を検証する。
- storage contract は extension page 上で `chrome.storage.local` を経由して `set / get / clear` の round-trip を `page.evaluate` で呼び出し、`{ kind: 'ok', value: 'written' }` を assert する。`chrome.storage.local` は TABBIN が production で使う polyfill alias と同一の code path。
- 既知の runtime smoke は Phase 2 と同様に dev / Unbranded build または AMO 署名済み XPI が必要(Phase 2 注意欄と同条件)。CI では `FIREFOX_EXTENSION_SMOKE=1` gate で skip 設計。

## Acceptance criteria の対応

Issue #722 の受け入れ条件に対する Phase 1 + 2 + 3 の対応と残課題。

- [x] Firefox extension の runtime smoke 方針が決定されている — 本ドキュメント
- [x] Firefox generated artifact を対象に test する — `verify:firefox-artifact` (Phase 1) +
      `verify:firefox-source` (Phase 3a) + `test:firefox:smoke` (Phase 2/3b)
- [x] extension startup failure を検出できる — Phase 1 は manifest / artifact contract、Phase 2 は profile install + `extensions.json` poll で install 失敗を throw、Phase 3b は `moz-extension://UUID/options.html` render assert で検出
- [x] storage read / write の最低限の contract を検証する — Phase 3b の `chrome.storage.local` round-trip smoke
- [x] options または saved tabs の主要画面を開けることを検証する — Phase 3b の title render assertion
- [x] Chrome 専用 API 利用が混入した場合の検出方法がある — Phase 3a verifier が `chrome-extension://` literal と chrome-only API を CI 常時 enforce
- [~] CI / nightly / release gate の実行タイミングが決定されている — Phase 1 / 3a は CI / release:check で常時、Phase 2 / 3b は workflow_dispatch で manual gate。nightly cron 自動実行は follow-up issue で整備

## follow-up 候補

別 issue として分割する作業。

- Firefox startup / UI smoke の nightly cron 自動実行と Firefox version pinning
- Firefox smoke を release build でも起動できる `browser_specific_settings.gecko.id` + AMO 署名済み XPI 配布設定
- `KNOWN_CHROME_EXTENSION_LITERAL_DEBT` の技術的負債解消:
  - `src/lib/background/ai-chat.ts` の fallback origin を `runtime.getURL` から derive する
  - `src/features/ai-chat/components/OllamaErrorNotice.tsx` の default origin を runtime 由来にする
  - `userSettingsDefaultsMerge.ts` の default exclude patterns に `moz-extension://` を追加する
  - i18n placeholder の説明文を browser-agnostic にする
  - `urlIdentityCorpus.ts` の corpus に対して Chrome / Firefox 両 scheme の入力を与える
- Persistence Model v2 migration smoke (Issue #722 の owner comment)
  - legacy `chrome.storage` fixture → Firefox startup → PersistenceBootstrap
    → preflight / migration → IndexedDB cutover → restart → saved tabs read
    → Backup V2 export
  - 関連 issue: #724, #726, #727, #728, #730, #735, #736

## 実行手順

### Phase 1 contract verifier (CI / release:check で常時)

```bash
bun run build:firefox
bun run verify:firefox-artifact
```

### Phase 3a source contract verifier (CI / release:check で常時)

```bash
bun run verify:firefox-source
```

### Phase 2 / 3b Firefox startup / UI smoke (manual / nightly gate)

```bash
bunx playwright install firefox
bun run build:firefox
FIREFOX_EXTENSION_SMOKE=1 bun run test:firefox:smoke
```

CI で manual 実行する場合は `Actions` タブから `CI` workflow を
`Run workflow` で dispatch する。`firefox-extension-smoke` job が走る。

## 注意点

- Chrome E2E をそのまま Firefox へ全複製しない。browser 差分の risk が高い flow
  (startup, storage API, persistence migration) を優先して smoke 化する。
- Firefox startup / UI smoke は Playwright firefox と profile に unpacked extension
  を copy して動かす設計。Firefox dev / Unbranded build または AMO 署名済み XPI
  が必要。release build では install されず、`firefoxExtensionUuid` fixture が
  throw する。CI 常時実行は workflow_dispatch gate に置く。
- Phase 1 verifier は build された manifest.json と artifact file が前提。build
  なしで実行すると manifest が無い旨の error で fail する。
- Phase 3a verifier は build 不要で production source のみを見るが、既存の技術的
  負債 5 file は `KNOWN_CHROME_EXTENSION_LITERAL_DEBT` で明示済み。新規の literal
  追加は verifier が block する。allowlist への追加は同一 PR で該当 file の Firefox
  追従を伴う場合のみ。
