# Dependency update policy

TABBIN は Renovate で dependency update を検知し、CI と手動 review を経て merge する。
CI success や vulnerability warning がないことだけを安全性の保証にしない。

## Renovate の責務

- `bun` と `github-actions` の version / lockfile update と PR 作成
- Dependency Dashboard で pending、approval、vulnerability、abandonment を可視化
- 通常 update は月曜 06:00 前（Asia/Tokyo）、npm release から14日待機
- major と TypeScript は Dashboard 承認後に PR 作成
- `rangeStrategy: pin` の初回 exact-version migration は専用 group として承認する
- automerge は patch、minor、major、security、Actions のすべてで禁止

breaking change に伴う application migration と実動作確認は人間または coding agent が
担当する。Renovate branch の rebase は Renovate だけが担当し、
`update-pr-branches.yml` は Renovate PR を更新しない。

## Review checklist

### TypeScript / test tool compatibility (2026-10-05)

- ルートの `typescript@7.0.2` を型検査と自前の AST 解析に使う。
  `compile` は `node node_modules/typescript/bin/tsc --noEmit` を明示する。
  `@typescript/native` alias は不要になった。
- 自前の解析は `tools/typescript/native-parser.mjs` の仮想プロジェクトを使う。
  構文エラーを拒否し、実 filesystem への fallback を許可しない。
  BOM / Unicode の UTF-16 位置と AST の親子関係を回帰テストで保護する。
  使用する `unstable/*` API が安定化するまで compiler version を exact pin する。
  同期 API を使う検証コマンドは、既存 runtime 契約の Node 24 で実行する。
- 旧 Compiler API を要求する外部 lint / dependency-cruiser は
  `tools/legacy-tooling` private workspace の `typescript@6.0.3` に隔離する。
  Bun の isolated linker を `bunfig.toml` で固定し、peer context を混在させない。
  dependency-cruiser は TypeScript peer を宣言していないため、専用 CLI adapter が
  同パッケージの import だけを旧 API に解決する。元の CLI、全ルール、
  type-only dependency の検出、診断、exit code を保持する。
- Storybook 10.6.1 の Vitest addon の peer range は Vitest 3 / 4 / 5。
  Vitest 関連 package は 5.0.3 に揃える。
  Vitest 5 は inline project が root config を既定で継承するため、
  `isolate: true` を明示してファイル間の module / mock 汚染を防ぐ。
  `clearMocks` の新しい既定値 `true` は維持する。
  Storybook の Vitest plugin が preview annotation を自動設定するため、
  ブラウザー用 `setupFiles` に Vite / WXT の Node 設定を読み込ませない。
- Motion 14 は公開 upgrade guide 上で breaking change がない。
  `@streamdown/code` 2 は Shiki 4 と Node 20 以上を要求するため、
  Node 24 / Shiki 4 の構成で実 plugin の強調表示と再描画を検証する。
- Node / Bun の runtime contract は維持し、`@types/node` は Node 24 系の最新版に揃える。
- Oxlint 1.79 以降で `react/react-compiler` が個別 rule に分割されたため、
  従来の native compiler rule の無効設定を各 rule に移す。
  既存の `react-hooks-compiler/*`（公式 ESLint plugin）の error 設定は維持する。
  新しい style rule は個別 const 宣言と arrow / function 宣言という既存規約に合わせる。

参照: [TypeScript 7 の併用方針](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-60)、
[Oxlint の rule 分割](https://github.com/oxc-project/oxc/pull/25500)、
[Vitest 5 migration guide](https://main.vitest.dev/guide/migration/)、
[Motion upgrade guide](https://motion.dev/docs/upgrade-guide)、
[@streamdown/code 2 release](https://github.com/vercel/streamdown/releases/tag/%40streamdown%2Fcode%402.0.0)。

### CI

- `bun install --frozen-lockfile`
- `bun run security:audit`
- `bun run compile`、`bun run check`、`bun run arch:check`
- `bun run secretlint`、`bun run test`、`bun run build`
- major / high-impact update は `bun run release:check`
- browser behavior に影響する場合は E2E と手動確認

### Upstream change

- release notes、changelog、major migration guide を確認する
- deprecated / removed API、runtime、compiler、bundler option の変更を確認する
- preview package は更新目的と必要性を先に確認する

### Supply chain

- package name、scope、repository、owner、rename、replacement を確認する
- install / preinstall / postinstall script の追加・変更を確認する
- `bun.lock` の不自然な package と大量の transitive dependency 増加を確認する
- third-party Action の owner、権限、参照 SHA を確認する
- `any`、`@ts-ignore`、lint disable、test skip で CI を通さない

## Bun lifecycle scripts

`trustedDependencies` は明示 allowlist で管理する。2026-07-12 の
`bun pm untrusted` では `spawn-sync@1.0.15` の postinstall だけが blocked され、
baseline test と build に不要だったため allowlist は空にした。

追加する場合は package source、script 内容、実行理由を確認し、追加前後に
`bun install --frozen-lockfile`、`bun pm untrusted`、build、test を実行する。
`bun pm trust --all` は使用しない。

## Audit exception review (2026-08-23)

Issue #827 で期限切れだった10件を全件再評価した。すべて解消可能になったため、
`security:audit` から ignore を削除した。継続する temporary exception はなく、
新しい期限は不要である。owner は dependency maintenance。

lockfile は既存 parent range の範囲内で修正版へ進めた。package owner / repository、
dependency 名、lifecycle script、`trustedDependencies` は変更せず、新しい transitive
package も追加していない。

### Resolved inventory

- [`GHSA-22p9-wv53-3rq4`](https://github.com/advisories/GHSA-22p9-wv53-3rq4)
  (`linkify-it`): `ansi-to-react` と `linkify-it` は current lockfile から既に消滅しており、
  production / tooling の dependency path はない。旧 ignore は stale だったため削除した。
- [`GHSA-3ppc-4f35-3m26`](https://github.com/advisories/GHSA-3ppc-4f35-3m26)
  (`minimatch`): `@storybook/react-vite` → docgen plugin → `glob` → `minimatch`
  と WXT → `web-ext-run` → `multimatch` → `minimatch` の build / test tooling path。
  attacker-controlled glob pattern を渡す product path はない。upstream の同一 major
  修正版 10.2.5 / 3.1.5 へ更新した。
- [`GHSA-7r86-cg39-jmmj`](https://github.com/advisories/GHSA-7r86-cg39-jmmj)
  (`minimatch`): dependency path と production 影響は上記と同じ。複数の非隣接
  `GLOBSTAR` を含む attacker-controlled pattern が必要で、TABBIN は固定した tooling
  pattern だけを使う。upstream 修正版 10.2.5 / 3.1.5 へ更新した。
- [`GHSA-23c5-xmqv-rm74`](https://github.com/advisories/GHSA-23c5-xmqv-rm74)
  (`minimatch`): dependency path と production 影響は上記と同じ。nested extglob と
  non-match input が必要で product input から到達しない。upstream 修正版
  10.2.5 / 3.1.5 へ更新した。
- [`GHSA-c2c7-rcm5-vvqj`](https://github.com/advisories/GHSA-c2c7-rcm5-vvqj)
  (`picomatch`): WXT visualizer / unimport / Vite plugin、Storybook plugin、
  React Doctor → `micromatch` の build / test tooling path。attacker-controlled extglob
  は渡さない。upstream の同一 major 修正版 2.3.2 / 4.0.4 へ更新した。
- [`GHSA-fx2h-pf6j-xcff`](https://github.com/advisories/GHSA-fx2h-pf6j-xcff)
  (Vite): WXT → `vite-node` → Vite 6 の tooling path だけが対象で、direct Vite 8
  と extension production bundle は対象外。network-exposed dev server と Windows
  path 条件を満たす設定はない。upstream 修正版 6.4.3 へ更新した。
- [`GHSA-p9ff-h696-f583`](https://github.com/advisories/GHSA-p9ff-h696-f583)
  (Vite): dependency path と production 影響は上記と同じ。unauthenticated client が
  network-exposed dev server の WebSocket へ到達する条件はない。upstream 修正版
  6.4.3 へ更新した。
- [`GHSA-mh99-v99m-4gvg`](https://github.com/advisories/GHSA-mh99-v99m-4gvg)
  (`brace-expansion`): WXT → `web-ext-run` → `multimatch` → `minimatch` 3 と、
  Storybook / ESLint 系 → `minimatch` 10 の build / test tooling path。外部入力の
  brace pattern は渡さない。後続 advisory も直す upstream 修正版 1.1.18 / 5.0.9
  へ更新した。
- [`GHSA-qwww-vcr4-c8h2`](https://github.com/advisories/GHSA-qwww-vcr4-c8h2)
  (`react-router`): `react-router-dom` から production bundle に入る唯一の runtime
  path。exploit は unstable React Server Components action API が条件だが、TABBIN は
  client-side router だけを使う。互換 pair の `react-router-dom` / `react-router`
  7.18.2 が公開済みになったため更新した。
- [`GHSA-rgw5-rvv9-x895`](https://github.com/advisories/GHSA-rgw5-rvv9-x895)
  (`brace-expansion`): dependency path と production 影響は上記 brace advisory と同じ。
  attacker-controlled expansion が必要で product path はない。bypass も解消する
  upstream 修正版 1.1.18 / 5.0.9 へ更新した。

`defu`、`lodash-es`、`postcss`、`rollup`、`shell-quote`、
`tmp` は引き続き同じ互換世代の修正版を top-level `overrides` で固定する。

### Publish audit refresh (2026-10-01)

- `fast-uri` は authority / host 正規化の advisory に対応する `3.1.8` に固定する。
  `ajv` の `^3.0.1` の範囲内で更新する。
- `undici` の一律 7 系 override は削除する。AI SDK と `cheerio` は修正版 `7.29.1`、
  `jsdom` は要求する 8 系の `8.11.2` を lockfile に解決し、それぞれの親の互換範囲を守る。
  audit ignore、runtime version、lifecycle script の許可は変更しない。

参照: [fast-uri の host 正規化修正](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj)、
[undici の TLS 検証修正](https://github.com/advisories/GHSA-w293-vg96-wgc3)。

## Vulnerability response

### node-forge RSA validation backport (2026-10-03)

`web-ext` は WXT 0.21 の Chrome / Firefox 開発ブラウザー起動に必要で、
`web-ext → @devicefarmer/adbkit → node-forge` が
[GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) の対象となる。
公開済み最新版 1.4.0 に修正がないため、
[上流 PR #1152](https://github.com/digitalbazaar/forge/pull/1152) の修正を含む
`digitalbazaar/forge#ceba34402e329f0365134f23fe19898756527d65` に固定する。
これは未リリースの snapshot (`1.4.1-0`) で、npm の修正版公開を意味しない。

1.4.0 との差分は RSA の nested DigestAlgorithm 要素数検査、回帰テスト、
changelog、snapshot version のみ。依存と lifecycle script に変更はなく、
`trustedDependencies` は空のまま維持する。owner は dependency maintenance。
上流 snapshot にも残る非空 ASN.1 NULL parameters の受理は、
`patches/node-forge-null-parameters.patch` で拒否する。
Bun の `patchedDependencies` と lockfile に patch の適用を記録し、
fresh install で適用と正常署名の互換性を確認する。
正式版への切替と patch 削除は、下記の検証がすべて成功する版の公開後に行う。

Git dependency は npm advisory の version 照合だけでは検証できないため、
`security:audit` の先頭で実 RSA 署名の正常系と異常 ASN.1 構造の拒否を検証する。
OID のみ / OID + 空の NULL は受理し、余分な OCTET STRING / NULL と
非空の NULL parameters は拒否する。
未修正 1.4.0 でこの probe が失敗することを確認済み。
その後の `bun audit --audit-level=high` は維持し、ignore は追加しない。

security update は14日待機を機械的に適用せず urgency を判断する。GitHub vulnerability
alerts、Renovate vulnerability PR、OSV、`bun audit` の結果を突き合わせる。
一時 ignore が必要な場合は advisory、dependency path、影響、upstream status、期限、
owner をこの文書または専用 Issue に残し、恒久的な ignore にしない。

## Initial rollout

最初の Renovate dependency PR は exact-version pin migration 専用として扱い、通常 update
と混在させない。`package.json` と `bun.lock` の差分、CI、PR 本文の security checklist、
high-impact package の grouping、Dashboard approval を確認してから手動 merge する。
定期的な lockfile maintenance は初期運用では有効化しない。

## Runtime toolchain updates

Node / Bun runtime version は `.node-version` / `.bun-version` を canonical source とする。

- `.node-version` は Renovate の `nodenv` manager で検知する
- `.bun-version` は Renovate の `bun-version` manager で検知する
- `enabledManagers` に `custom.regex` を含め、`package.json` 内の runtime version source を
  同一 dependency identity として検知する
- Node runtime の package.json sync 対象: `engines.node`
- Bun runtime の package.json sync 対象: `engines.bun` と `packageManager`
- Node runtime と Bun runtime は別々の `groupName` でグルーピングする
  - Node group: `nodenv` + `custom.regex` (`node-version` datasource) `minimumGroupSize: 2`
  - Bun group: `bun-version` + `custom.regex` (`npm` datasource, packageName `bun`) `minimumGroupSize: 3`
- runtime update は Dependency Dashboard 承認後に PR を作成する
- runtime update の automerge は禁止
- `@types/node` は Node major update と無条件に自動同期せず、runtime major migration として人間が確認する
- Node major と `@types/node` major の不一致は `bun run verify:toolchain-versions` で検知する
- CI の各 job では `bun install --frozen-lockfile` の前に `bun run verify:toolchain-versions` を実行する
- `sync:toolchain-versions` は Renovate runtime PR automation の primary path ではなく、
  ローカルでの診断 / 手動補助ツールとして残している
- Bun update 後は `bun install --frozen-lockfile`、`bun run security:audit`、
  `bun run quality:check`、`bun run build`、`bun run build:firefox` を review 時に確認する
- runtime update は human manual merge とする
