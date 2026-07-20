---
name: create-skill
disable-model-invocation: true
description: AI エージェント向けの skill を作成・編集します。新しい skill の執筆、既存 skill の改善、deploy 前の skill 検証、SKILL.md 構造についての質問時に使います。Codex / Claude Code / Cursor など各クライアントの skill 仕様に合わせて生成します（旧 writing-skills の TDD 執筆手法を統合済み）。
---
# AI エージェント向け skill の作成

AI エージェント向けの effective skill 作成手順です。skill は markdown file で、agent に specific task の実行方法を教えます。例: team standard による PR review、好みの format での commit message 生成、database schema query、任意の specialized workflow など。

## 開始前: 要件の収集

skill 作成前に、ユーザーから次の essential information を収集します:

1. **Purpose and scope**: この skill が支援すべき specific task または workflow は何か
2. **Target location**: どのクライアント向けか、personal か project か（Codex: ~/.agents/skills/ または .apm/skills/、Claude Code: ~/.claude/skills/、Cursor: ~/.cursor/skills/ と .cursor/skills/）
3. **Trigger scenarios**: agent がいつ自動的にこの skill を適用すべきか
4. **Key domain knowledge**: agent が既知でない specialized information は何か
5. **Output format preferences**: 特定 template、format、style が必要か
6. **Existing patterns**: 従う existing example や convention はあるか

### ユーザーからの verbatim text

ユーザーが skill 内で使う exact wording を含める場合、respect し `SKILL.md` に **verbatim** で使う（同じ語、同じ順）。paraphrase、soften、expand しない。依頼されていない heading や commentary を周囲に追加しない。

### コンテキストからの推測

会話 context がある場合、議論内容から skill を推測できます。会話で出た workflow、pattern、domain knowledge に基づいて skill を作成できます。

### 追加情報の収集

clarification が必要な場合、AskQuestion tool が使えれば使用:

```
Example AskQuestion usage:
- "Where should this skill be stored?" with options like ["Personal (Codex: ~/.agents/skills/, Claude: ~/.claude/skills/, Cursor: ~/.cursor/skills/)", "Project (.apm/skills/ via APM, or .cursor/skills/)"]
- "Should this skill include executable scripts?" with options like ["Yes", "No"]
```

AskQuestion tool が使えない場合、会話で質問します。

---

## Skill File Structure

### Directory Layout

skill は `SKILL.md` を含む directory として保存:

```
skill-name/
├── SKILL.md              # Required - main instructions
├── reference.md          # Optional - detailed documentation
├── examples.md           # Optional - usage examples
└── scripts/              # Optional - utility scripts
    ├── validate.py
    └── helper.sh
```

### Storage Locations

| Type | Path | Scope |
|------|------|-------|
| Personal (Codex) | ~/.agents/skills/skill-name/ | Available across all your projects |
| Personal (Claude Code) | ~/.claude/skills/skill-name/ | Available across all your projects |
| Personal (Cursor) | ~/.cursor/skills/skill-name/ | Available across all your projects |
| Project (TABBIN / APM) | .apm/skills/skill-name/ | APM で全クライアントへ配布。source of truth |
| Project (Cursor 単体) | .cursor/skills/skill-name/ | Shared with anyone using the repository |

**IMPORTANT**: TABBIN では skill の source of truth を `.apm/skills/` に置き、`bun run apm:sync` で各クライアントへ配布します。クライアント固有の配布先へ直接編集せず原則 `.apm/skills/` を更新してください。Cursor の `~/.cursor/skills-cursor/` は Cursor internal built-in skill 用で system が自動管理するため使わないでください。

### SKILL.md Structure

すべての skill に YAML frontmatter と markdown body 付き `SKILL.md` が必要:

```markdown
---
name: your-skill-name
description: Brief description of what this skill does and when to use it
disable-model-invocation: true
---

# Your Skill Name

## Instructions
Clear, step-by-step guidance for the agent.

## Examples
Concrete examples of using this skill.
```

default `disable-model-invocation: true` で、明示的に name 指定時のみ load。ambient context から agent が auto-invoke すべき場合のみ omit。

### Required Metadata Fields

| Field | Requirements | Purpose |
|-------|--------------|---------|
| `name` | Max 64 chars, lowercase letters/numbers/hyphens only | Unique identifier for the skill |
| `description` | Max 1024 chars, non-empty | Helps agent decide when to apply the skill |

---


## 詳細参照

次の内容は `authoring-patterns.md` に分離した。SKILL.md は入口なので、必要時に参照する。

- Description の書き方と例
- Core Authoring Principles（concise / 500 行以下 / progressive disclosure / degrees of freedom）
- Common Patterns（template / examples / workflow / conditional / feedback loop）
- Utility Scripts
- Anti-Patterns to Avoid
- Skill Creation Workflow（discovery / design / implementation / verification）
- Complete Example

詳細は [authoring-patterns.md](authoring-patterns.md) を参照。

## skill 執筆の TDD（旧 writing-skills 統合）

**Skill の執筆はプロセス文書への TDD 適用です。** RED（baseline）→ GREEN（skill 執筆）→ REFACTOR（loophole 塞ぎ）。規律 skill は 3+ の複合 pressure を使う。各 skill を書いたら STOP し deploy checklist を完了してから次へ。詳細（手順・チェックリスト・アンチパターン・STOP 規則・finalize checklist）は [skill-authoring-tdd.md](skill-authoring-tdd.md) に分割済み（500 行制限のため）。

### 参照ファイル（旧 writing-skills から統合）

- [anthropic-best-practices.md](anthropic-best-practices.md) — Anthropic 公式 skill 執筆 best practice の完全版。
- [testing-skills-with-subagents.md](testing-skills-with-subagents.md) — pressure scenario の書き方、pressure タイプ、体系的 hole 塞ぎ、meta-testing の完全方法論。
- [persuasion-principles.md](persuasion-principles.md) — 規律 skill で rationalization を防ぐ説得原則。
- [graphviz-conventions.dot](graphviz-conventions.dot) / [render-graphs.js](render-graphs.js) — skill 内 flowchart の graphviz 規約と描画補助。
- [examples/](examples/) — 執筆例。

> これらは progressive disclosure による参照資料です。SKILL.md から直接 link し、deeply nested な参照は避けてください。