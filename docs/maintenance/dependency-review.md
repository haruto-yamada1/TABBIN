# PR dependency review

Issue #940 の Dependency Review は `.github/workflows/dependency-review.yml` で
`develop` / `main` 向けの全 PR に実行する。結果は check と job summary で確認する。
Renovate の依存更新 PR も同じ検査を受け、automerge は引き続き禁止する。

## Policy

- 追加・更新された直接依存と推移依存を、runtime / development / unknown の
  全スコープで検査する。複数の nested version と同じ version の integrity / metadata
  変更も対象にする。削除だけの差分や変更のない依存は差分検査を省略する。
- GitHub-reviewed npm advisory の High / Critical を拒否する。Bun 検査では
  severity unknown も人間の確認が必要なため拒否し、withdrawn advisory は除く。
- 許容ライセンスは `tools/scripts/dependency-review.ts` の `allowedLicenses` を参照。
  GitHub Action に同じ allowlist を設定し、一致を回帰テストで保証する。
  npm metadata にライセンスがない場合、非 SPDX 表記、複合式、allowlist 外の
  license は Bun 検査で失敗する。複合式は自動で互換性を推測しない。
- HTTP error、timeout、invalid JSON / schema、advisory pagination による
  不完全な結果、registry の name / version 不一致は失敗とする。
  `warn-only`、`continue-on-error`、サービス障害による skip は使わない。
  GitHub の snapshot warning は最大120秒待ち、Bun 差分検査を空 Graph の補完に使う。

## GitHub Dependency Graph と Bun

2026-10-11 に public repository と Dependency Review API の HTTP 200 を確認した。
SHA 固定の `actions/dependency-review-action` v5.0.0 を使用する。

実際の Renovate [PR #868](https://github.com/haruto-yamada1/TABBIN/pull/868) は
`package.json` の override と `bun.lock` の `shell-quote` 1.10.0 → 1.11.0 を変更するが、
次の API は HTTP 200 / 空配列だった。

```
GET /repos/haruto-yamada1/TABBIN/dependency-graph/compare/
e25ea602b8bd321539f9427d6d2ed989ffe74c3f...20a17495fe86f489e97877381690f50ed4996eb5
```

Renovate #866 / #857 でも差分が空だった。`main...develop` の比較は
`package.json` 等を返したが `bun.lock` manifest を返さなかった。
この観測から、GitHub 側の空結果を全解決依存の合格証拠には使わない。
`bun.lock` を JSON5 として読み、追加・更新された全 npm resolution を
[Global Security Advisory API](https://docs.github.com/en/rest/security-advisories/global-advisories)
の exact `name@version` query と npm registry の exact-version license metadata で検査する。
ソース不明の git / file / tarball 解決は自動で許可しない。

Dependency Submission API も評価した。Graph への snapshot 登録には
`contents: write` が必要で、fork の read-only token では実行できない。
trusted push だけの submission は fork PR の差分保証にならず、write token を使う
`pull_request_target` は導入しない。今回は submission を追加せず、同じ Bun 検査を
fork にも実行する。Graph の native support が改善した際は実 PR で再確認する。

## fork と実行境界

`pull_request` と `contents: read` のみを使う。checkout は head SHA に固定し、
credentials を保存しない。`bun install --frozen-lockfile --ignore-scripts` で
依存と repository の lifecycle script を実行しない。追加 secret、PR comment、
Graph 書き込み、write permission は不要。
read-only `github.token` は public Advisory API の rate limit 対策にのみ渡し、
npm registry には渡さない。HTTP redirect も許可しない。

## 既存ゲートと例外

`security:audit` は全依存の現在の audit と node-forge の実 RSA probe を担当する。
この PR 差分検査は導入した依存に焦点を当て、license を追加で検査する。
変更のない依存に後から発見された advisory は既存 audit / alerts / Renovate で扱う。
SBOM は release artifact の在庫と provenance で、advisory の合否を代替しない。
`security:audit`、Renovate、SBOM と `release:check` は変更しない。

既存の `node-forge` は Git snapshot と Bun patch で修正しており、npm version
照合の例外である。base と同じ `node-forge@github:digitalbazaar/forge#ceba344`
entry のみ維持し、source / integrity / patch の変更は失敗させる。
lockfile の patch map は path のみを持つため、workflow が base/head の `patches/`
差分も拒否する。同じ path の patch 本文変更を見逃さない。
`security:audit` の正常署名・異常 ASN.1 拒否 probe は必須で、GHSA 全体の allow は追加しない。
owner: dependency maintenance / @haruto-yamada1。次の再評価期限: 2026-11-10。
正式版に切り替える際は [既存 backport の検証条件](dependency-updates.md) を満たすこと。

現時点の追加 advisory / license exception は0件。false positive は exact package/version、
GHSA または license、依存経路、根拠、担当、30日以内の期限を記録して個別 PR で評価する。
期限切れなら再評価し、package 全体・全 GHSA の恒久 allow や check の無効化は使わない。

## 検証

```
bun run test:node -- tools/scripts/dependency-review
bun run ci:lint
bun run ci:security
BASE_LOCK=/absolute/path/base-bun.lock bun tools/scripts/run-dependency-review.ts
```

危険な追加推移依存、High / Critical、未知 severity、未知 license、複数 version、
通信異常、registry mismatch、patch 変更と fork の権限を fixture で検証する。
CLI の JSON report は `.output/dependency-review/report.json` に保存する。

参照: [Dependency Review Action](https://github.com/actions/dependency-review-action)、
[Dependency Submission API](https://docs.github.com/en/rest/dependency-graph/dependency-submission)。
