# PR dependency review

リリース判定には、追加調査と対応を記録した
[2026-10-22 配布物ライセンス監査](release-license-audit.md)も参照する。
依存差分の許諾確認と、実際の配布物への原文・著作権表示・ソース案内の同梱は
別々に検証する。

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
  license は下記の個別承認に一致するものを除き Bun 検査で失敗する。
  複合式は自動で互換性を推測しない。SWC native packages の
  `Apache-2.0 AND MIT` と、原文も確認した victory-vendor の `MIT AND ISC` は、
  既に許容しているライセンスの両方に従う式として明示登録する。
  DOMPurify の `(MPL-2.0 OR Apache-2.0)` は原文を確認し、配布時に許容済みの
  Apache-2.0 を選択する式として明示登録する。それ以外の複合式と MPL 単独は許可しない。
  `MIT-0`（[MIT No Attribution](https://spdx.org/licenses/MIT-0.html)）も許容する。
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
`release:check` / `release:zip` は同じ `security:audit` を配布直前にも実行する。
監査不能時の failure policy と再評価期限は [release 手順](../release.md) に従う。
Renovate、SBOM と PR 差分検査の責務は維持する。

既存の `node-forge` は Git snapshot と Bun patch で修正しており、npm version
照合の例外である。`node-forge@github:digitalbazaar/forge#ceba344` の初回リリースも
`dependency-patch-policy.ts` に記録した完全な source pin / 全解決先 / integrity /
patch digest / map に一致する場合だけ認める。base に導入済みの patch の変更や削除は
失敗させる。install 後に再確認期限と実 RSA probe を同じ job で検証する。
lockfile の patch map は path のみを持つため、workflow が base/head の `patches/`
全体を Git snapshot から検証する。同じ path の本文・mode 変更、削除、rename、
未知の追加は拒否する。node-forge patch の変更は引き続き許可しない。
この gate は依存 install より前に実行し、Bun の組み込み JSON5 parser と Node の
組み込み機能だけを使う。`--ignore-scripts` でも patch は適用されるため、検査前に
patch 済みの JSON5 / zod などを import しない。

レビュー済みの新規追加だけは `tools/scripts/dependency-patch-policy.ts` に対象
package/version、npm integrity、patch path と SHA-256 を記録して許可できる。
現在の登録は上記 node-forge backport と Stryker Vitest runner 10.0.0 の
upstream #6247 互換修正。
map 追加と regular file (`100644`) 追加は一対一で照合し、本文・対象解決・integrity の
不一致、同一versionの別integrity、孤立した file/map を拒否する。登録済み patch が
base に入った後の編集も許可しない。登録の変更は個別 PR の security review 対象。

Bun scanner も同じ判定と実際の patch bytes を使う。レビュー済み patch を新たに
適用した依存は、base に同じ version が存在しても advisory/license を再スキャンする。
これは patch 内容の承認であり、advisory / license の例外ではない。
`security:audit` の正常署名・異常 ASN.1 拒否 probe は必須で、GHSA 全体の allow は追加しない。
owner: dependency maintenance / @haruto-yamada1。再評価記録は
`tools/security-audit-policy.json`（2026-11-10 00:00 UTC）、承認履歴は
`tools/scripts/security-audit-review-approvals.ts` で管理する。
`security:audit` は最新承認との一致に加え、patch bytes と全 node-forge lock binding を
release gate でも検証する。期限更新は新しい追跡 Issue を持つ承認レコードの追記が必要。
正式版に切り替える際は [既存 backport の検証条件](dependency-updates.md) を満たすこと。

追加 advisory exception は0件。個別 license 承認は以下の2パッケージのみ。

- `react-doctor`（開発用の直接依存）と
  `oxlint-plugin-react-doctor`（同ツールの付属ルール）。
- 配布物の `LICENSE` は [Modified MIT](https://github.com/millionco/react-doctor/blob/main/LICENSE)。
  SPDX MIT と同一とは扱わない。開発時のコード検査のみを承認し、AI 学習・モデル改善の
  学習/評価データへの利用、および React Doctor 自体を価値の中心とする有料サービスは
  承認の対象にしない。元の追加条件に従い、これらの用途には権利者の書面許可が必要。
- [PR #978](https://github.com/haruto-yamada1/TABBIN/pull/978) の修正依頼に伴い
  ユーザーが用途限定の例外を承認。owner: dependency maintenance / @haruto-yamada1。
  承認日2026-10-21 UTC、期限2026-11-20 00:00 UTC（30日）。
- `dependency-license-policy.ts` では package 名・用途・承認済み LICENSE の
  SHA-256 と期限を管理する。version / integrity を例外定義に固定せず、現在の
  `bun.lock` と exact-version npm metadata を照合する。同じ LICENSE の版更新では
  例外の手直しは不要。全 nested resolution と全 installed copies を検証し、
  LICENSE 不明・変更、registry identity / integrity 不一致、非 npm source、期限切れ、
  各 workspace の本番依存宣言（npm alias を含む）を拒否する。
  未変更の対象パッケージも差分 CLI で再検査し、Advisory API による
  High / Critical / unknown の検査を省略しない。
- GitHub Action の `allow-dependencies-licenses` は PURL の version を無視するため、
  `pkg:npm/react-doctor` だけを指定し、先行する必須の
  `verify-dependency-licenses.ts` で上記境界を検証する。検証失敗時は job 全体が失敗する。
  Modified MIT 自体を許容 SPDX 一覧へ追加せず、`license-check: true` は維持する。
- ローカルと agent skill は `bun run doctor` を使う。実行前に lockfile と実配布物の
  LICENSE を検証し、検証済みのローカル CLI だけを起動する。`npx` / `bunx` の
  `@latest` で迂回しない。CI は patch 検証 → frozen install（lifecycle script 無効）→
  LICENSE 検証を通し、同じローカル wrapper を直接実行する。公式 Action による別の
  npm install は使わない。read-only の scan job が全 project の完了と score を検証し、
  100点を必須にする。PR の summary / inline review は、checkout や repository code の
  実行を行わない別 job へ分離する。古い head の結果は投稿せず、fork の read-only token
  で投稿できなくても scan の品質判定は変えない。
  `release:check` も同じ承認条件を検査する。LICENSE が変わる更新は原文と用途を
  再評価し、期限は自動延長しない。

今後の個別承認も exact package/version、GHSA または license、依存経路、根拠、担当、
30日以内の期限を記録して個別 PR で評価する。
期限切れなら再評価し、package 全体・全 GHSA の恒久 allow や check の無効化は使わない。

## 配布物の原文・著作権表示と対応ソース

WXT の `build:done` で実際の chunk module graph から npm 配布物を特定し、
`tools/licenses/` が `THIRD_PARTY_NOTICES.txt` と `THIRD_PARTY_LICENSES.json` を生成する。
内部の private subpath manifest は親の npm 配布物へ帰属させる。原文の LICENSE / COPYING /
NOTICE / copyright と vendored legal files を保持し、許可条件が不明なものや原文不足は
build を失敗させる。標準 Apache の短い application notice は、その著作権表示を保持し、
検証済みの標準全文を補う。

npm 配布物が原文を欠く場合に限り、`reviewed-licenses.json` の exact package/version /
integrity と原文の SHA-256・immutable upstream provenance を照合して補う。
`react-remove-scroll-bar@2.3.8` は npm gitHead が取得できないため、公式 repo の同一著作者・
同一 MIT 宣言と LICENSE 履歴を確認した project-wide grant を使うことを、登録に明記する。
新しい版へこの登録を自動流用しない。

MPL-2.0 の `webextension-polyfill` は `sources.json` で実配布版・integrity と一致する
preferred-form source archive を管理する。source / build files / LICENSE を含む原本を
`third-party-sources/` に同梱し、notice に入手方法を載せる。ソースの欠落・古い版・hash
不一致は失敗させる。DOMPurify の MPL/Apache 選択式は Apache-2.0 を選び、その原文を保持する。

Chrome / Firefox の extension ZIP と source ZIP の両方へ同梱し、`verify:third-party-licenses` /
`verify:third-party-license-zips` が欠落・改変を拒否する。WXT の ZIP hook、CI の Verify Build、
`release:check` / `release:zip` から実行する。ビルド中の外部 download は不要。
Doctor 本体・付属ルール・node-forge の runtime bundle 混入は module graph で拒否する。
source ZIP には workspace の `tools/legacy-tooling` と `patches/`、検証 CLI も含める。
展開した ZIP だけで frozen offline install、WXT prepare、両ブラウザ build と notice 検証を
実行して再ビルド可能性を確認する。

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
