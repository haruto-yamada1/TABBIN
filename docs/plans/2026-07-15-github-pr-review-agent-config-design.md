# GitHub PR Review Agent Configuration Design

## Goal

APM を source of truth としたまま、GitHub の Open PR に届いたレビューを投稿者や
サービスに依存せず検証・対応できる `github-pr-review` skill を追加する。同時に、
APM 0.18.0 の install が管理対象ファイルを cleanup 対象として扱う不安定な同期経路を
安全な repository command に集約し、必須生成物の保持と冪等性を検証できるようにする。

## Current Problems

- `apm install --dry-run --frozen` は現在の lockfile にある 229 個の local deployed file を
  「packages no longer in apm.yml」として削除候補にする。通常 install は同じ run 内で
  local package を再配布するため今回の隔離再現では最終的な消失は起きなかったが、cleanup と
  再配布が同一処理に依存し、中断や target drift に弱い。
- APM 0.18.0 は Cursor target を内部で `vscode` として扱う経路があり、MCP config write で
  unknown target を報告する。APM source の配布自体は完了するものの、通常 install は
  `.gitignore`、`apm.lock.yaml`、untracked `.opencode/` も変更する。
- 既存 `receiving-code-review` はレビュー内容を技術的に検証する原則を持つが、Open PR の特定、
  live unresolved thread の取得、PR HEAD との照合、commit/push/reply、永続化判断までを
  一つの GitHub workflow として提供していない。
- skill 追加前の fresh-agent pressure test でも live thread、HEAD 再確認、根本修正、返信禁止操作は
  一般規約から導けた一方、repository 内の検索可能な判断記録と enforcement 昇格基準がなく、
  repository docs ではなく個人 memory へ保存する判断になった。再現性のある入口と保存先が必要である。
- 継続改善の判断を、型・schema・lint・architecture test・regression test・CI・skill・docs の
  どこへ昇格するかを決める検索可能な repository contract がない。

## Chosen Architecture

### 1. Safe APM synchronization

`tools/scripts/sync-agent-config.ts` を repository-owned entrypoint とする。

1. `apm compile --validate` で source primitives を検証する。
2. `apm.yml`、`apm.lock.yaml`、`.apm/` を一時 project へ複製し、そこで本番と同じ
   `apm install --frozen --force --only apm` と
   `apm compile --single-agents --no-dedup` を実行する。
3. scratch 上の `AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、`github-pr-review` skill が存在し、
   必須内容を含むことを検証する。
4. 同じ scratch project で二回同期し、cleanup/redeploy 後の管理対象 snapshot が一致することを
   確認する。
5. 各同期後に `apm.lock.yaml` を repository formatter で整形する。
6. check mode では tracked な `AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、`apm.lock.yaml` を scratch
   結果と byte comparison し、drift を非ゼロ終了にする。
7. check mode でなければ、同じ `apm.yml` の target 設定で repository root を同期し、必須生成物を再検証する。

MCP 配布はこの command の責務に含めない。APM 0.18.0 の Cursor/vscode target drift と
repository-local agent artifact の同期を分離し、agent configuration を失敗なく再現するためである。
`--single-agents` は client 別 rules が展開済みでも root `AGENTS.md` を完全生成し、
`--no-dedup` は `.claude/rules` があっても `CLAUDE.md` を完全生成する。両者により、複数 client へ
同じ共通指示を配布するこの repository の意図的な contract を維持する。

### 2. Source-agnostic GitHub review workflow

`.apm/skills/github-pr-review/SKILL.md` を追加する。CodeRabbit、人間、その他サービスは
いずれも review source として扱い、処理の中心は comment の技術的妥当性と live state とする。

- Open PR と最新 head SHA を確定する。
- flat comment ではなく live review thread、review、issue comment を取得し、未解決・非 outdated・
  未対応の項目を正規化する。
- 各項目を `adopt`、`partially-adopt`、`reject`、`defer` に分類する。
- 現在の code path、型、schema、test、runtime、repository rule で妥当性を検証する。
- 妥当なら根本修正、regression test、検証、scoped commit、PR branch push、thread reply を行う。
- 妥当でなければ code を変更せず、同じ thread へ根拠を返信する。
- 人間コメントへの返信は、ユーザーが返信を明示的に依頼した場合だけ行う。
- merge、close、approve、base branch push、force push、無断 resolve は行わない。

既存 `receiving-code-review` は妥当性検証の原則として再利用し、GitHub workflow と重複させない。

### 3. Continuous improvement

`docs/code-review/` に template と index を置く。すべての comment を保存せず、再利用可能で、
検証済みで、既存の機械的 guard にまだ取り込めない判断だけを候補にする。

昇格順は、型、runtime schema、lint/architecture rule、regression test、CI、hook、skill、
APM common instruction、docs とする。新規記録前に既存 docs、skills、instructions、rules、tests を
検索し、同じ根本原因なら既存 record を更新する。

## Source of Truth

- 編集対象: `.apm/skills/**`、`.apm/instructions/**`、`tools/scripts/**`、`docs/**`、`package.json`
- 生成対象: `AGENTS.md`、`CLAUDE.md`、`.agents/skills/**`、各 client の generated surface
- 生成済みファイルは直接編集せず、正規 APM command だけで更新する。

## Verification

- process skill の baseline/updated pressure scenario
- sync script unit tests の RED/GREEN
- `apm compile --validate`
- `bun run apm:sync` を二回実行した差分比較
- `bun run test:coverage`
- `bun run quality:check`
- commit 後の `bun run release:check`
- fresh-context review と Open PR remote state の確認
