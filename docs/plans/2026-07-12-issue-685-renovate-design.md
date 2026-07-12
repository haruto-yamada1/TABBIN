# Issue #685 Renovate 導入設計

## 目的

Renovate に依存更新の検知、更新 branch、PR、Dependency Dashboard を担当させ、
CI と人手 review により breaking change と supply-chain risk を判断する。
自動 merge は行わず、Renovate を application migration tool として扱わない。

## 構成

- `.github/renovate.json` を Renovate policy の source of truth とする。
- `bun` と `github-actions` のみを manager として有効化する。
- 通常 npm update は月曜早朝、公開から14日後、major は Dashboard 承認後とする。
- preview dependency、脆弱性修正、GitHub Actions を通常 update と分離する。
- `package.json` と CI に `bun audit --audit-level=high` を追加する。
- GitHub Actions は full commit SHA に固定し、Renovate に digest update を任せる。
- `update-pr-branches.yml` は Renovate bot/branch を除外し、rebase の二重管理を防ぐ。
- `docs/maintenance/dependency-updates.md` に review と incident 対応を記録する。

## Security boundary

Renovate の `ignoreScripts: true` を不変条件として明示する。Bun の
`trustedDependencies` は `bun pm ls --trusted` と `bun pm untrusted` の実測結果から、
install/build に必要な package だけを許可する。GitHub vulnerability alerts、OSV、
`bun audit` は相互補完とし、いずれも安全性の保証として扱わない。

## 検証

Node project の静的テストで Renovate policy、audit script/CI、Action SHA、Renovate PR
除外を検証する。Renovate config validator、`bun run security:audit`、全 test、coverage、
quality、release build を実行し、最後に security review と fresh-context evaluator を行う。

GitHub App はユーザーが TABBIN に Interactive mode で設定済みであり、初回 job の結果と
Dependency Dashboard/onboarding の生成は外部状態として確認する。
