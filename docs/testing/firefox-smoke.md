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

Playwright Firefox で実際に Firefox artifact を temporary add-on として読み込み、
起動失敗を検出する smoke を用意する。CI の push / pull_request では実行せず、
`workflow_dispatch` または `FIREFOX_EXTENSION_SMOKE=1` で実行する manual / nightly
gate に置く。理由は Firefox about:debugging の UI 構造が Firefox version 依存で
CI 常時実行では flake が大きくなるため。実行回数は限定的でも artifact が startup
しない退化を検知できる状態を保つ。

- `e2e/helpers/firefox-extension.ts` が `firefox.launchPersistentContext` で firefox
  を起動し、`about:debugging#/runtime/this-firefox` から "Load Temporary Add-on"
  で manifest.json を読み込む。
- `e2e/firefox.extension.smoke.spec.ts` が addon が "Temporary Extensions" に
  表示されることを assert する。環境変数がないと skip する。
- `playwright.firefox.config.ts` が smoke 用の単独 config。workers=1 で直列実行。
- `bun run test:firefox:smoke` で実行。`bunx playwright install firefox` 済みの
  環境が必要。
- CI は `.github/workflows/ci.yml` の `firefox-extension-smoke` job が
  `workflow_dispatch` で発火する。push / pull_request では走らない。nightly cron
  での自動実行は follow-up issue で整備する。

## Acceptance criteria の対応

Issue #722 の受け入れ条件に対する Phase 1 + 2 の対応と残課題。

- [x] Firefox extension の runtime smoke 方針が決定されている — 本ドキュメント
- [x] Firefox generated artifact を対象に test する — `verify:firefox-artifact` +
      `test:firefox:smoke`
- [x] extension startup failure を検出できる — Phase 1 は manifest / artifact
      contract、Phase 2 は about:debugging による temporary addon load で検出する
- [ ] storage read / write の最低限の contract を検証する — Phase 3 (follow-up)
- [ ] options または saved tabs の主要画面を開けることを検証する — Phase 3 (follow-up)
- [~] Chrome 専用 API 利用が混入した場合の検出方法がある — Phase 1 manifest
  permission blocklist と `assertChromeFirefoxManifestDelta` で API permission
  delta を検出する。source code 中の `chrome.*` 専用コード path の static 検出は
  Phase 3 で追加する。
- [~] CI / nightly / release gate の実行タイミングが決定されている — Phase 1 は
  CI / release:check で常時実行、Phase 2 は workflow_dispatch で manual gate。
  nightly 自動実行の cron 設定は follow-up issue で追加する。

## follow-up 候補

別 issue として分割する作業。

- Phase 3: storage / options / saved tabs 主要画面を Firefox artifact で開く smoke
- Chrome 専用 API 利用混入を source code から検出する static check
- Firefox startup smoke の nightly cron 自動実行と Firefox version pinning
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

### Phase 2 Firefox startup smoke (manual / nightly gate)

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
- Firefox startup smoke は about:debugging の DOM 構造に依存するため、CI 常時
  実行はしない。flake を trigger にするのではなく failure moe を減らす方針で
  整備し、Phase 3 に合わせて安定化を進める。
- Phase 1 verifier は build された manifest.json と artifact file が前提。build
  なしで実行すると manifest が無い旨の error で fail する。
