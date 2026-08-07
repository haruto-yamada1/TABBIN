# Dependency update policy

TABBIN は Renovate で dependency update を検知し、CI と手動 review を経て merge する。
CI success や vulnerability warning がないことだけを安全性の保証にしない。

## Renovate の責務

- `bun` と `github-actions` の version / lockfile update と PR 作成
- Dependency Dashboard で pending、approval、vulnerability、abandonment を可視化
- 通常 update は月曜 06:00 前（Asia/Tokyo）、npm release から14日待機
- major と `@typescript/native-preview` は Dashboard 承認後に PR 作成
- `rangeStrategy: pin` の初回 exact-version migration は専用 group として承認する
- automerge は patch、minor、major、security、Actions のすべてで禁止

breaking change に伴う application migration と実動作確認は人間または coding agent が
担当する。Renovate branch の rebase は Renovate だけが担当し、
`update-pr-branches.yml` は Renovate PR を更新しない。

## Review checklist

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

## Temporary audit exceptions

次の例外は、同一 package の複数 major が lockfile に共存する、または親 package が
旧 major を固定しているため、top-level `overrides` では安全に解消できない。
期限: 2026-08-12。期限までに親 package と lockfile を再確認し、修正版へ進めるなら
例外を削除する。期限延長には新しい Issue、upstream status、影響評価が必要。

- `GHSA-22p9-wv53-3rq4`: `ansi-to-react` が旧 `linkify-it` major を要求するため。
- `GHSA-3ppc-4f35-3m26`: `minimatch` 3系と10系が共存するため。
- `GHSA-7r86-cg39-jmmj`: 同じ `minimatch` 複数世代制約のため。
- `GHSA-23c5-xmqv-rm74`: 同じ `minimatch` 複数世代制約のため。
- `GHSA-c2c7-rcm5-vvqj`: `picomatch` 2系と4系が共存するため。
- `GHSA-fx2h-pf6j-xcff`: direct Vite 8 と WXT 経由の Vite 6 が共存するため。
- `GHSA-p9ff-h696-f583`: 同じ WXT / Vite 6 経路のため。
- `GHSA-mh99-v99m-4gvg`: WXT → `web-ext-run` → `multimatch` →
  `minimatch` 3 が修正版のない `brace-expansion` 1.x を要求し、Storybook /
  ESLint 系 tooling も 5.0.7 を解決する。修正版は 5.0.8 のみで、Bun は親を
  限定した nested override を未対応。すべて build / test tooling の経路であり、
  TABBIN は外部入力の glob を渡さない。
- `GHSA-qwww-vcr4-c8h2`: TABBIN は client-side browser extension であり、対象の
  unstable React Server Components API を使用しない。修正版 `react-router` 8.3.0
  に対応する `react-router-dom` は未公開で、現行 7.18.1 が core 7.18.1 を固定するため。
- `GHSA-rgw5-rvv9-x895`: `brace-expansion` 4.x に起因する DoS advisory を回避する
  修正版 5.0.8+ は、`minimatch` 3系 (`web-ext-run` → `multimatch` 経由) が 1.x に
  固定しているため nested override で解決できない。`GHSA-mh99-v99m-4gvg` と同じ
  build / test tooling 経路のみで WXT production bundle には含まれず、TABBIN は
  外部入力の glob を渡さない。期限 2026-08-12 までに `minimatch` 複数世代の解消状況を再確認する。

追加した2件の owner は dependency maintenance。期限内に WXT の旧 glob chain と
`react-router-dom` の 8.x 対応を再確認する。`GHSA-rgw5-rvv9-x895` は
`GHSA-mh99-v99m-4gvg` と同じ経路なので同じ owner / 期限で追跡する。

修正版が同じ互換世代にある `defu`、`lodash-es`、`node-forge`、`postcss`、
`rollup`、`shell-quote`、`tmp`、`undici` は `overrides` で固定し、例外にしない。

## Vulnerability response

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
