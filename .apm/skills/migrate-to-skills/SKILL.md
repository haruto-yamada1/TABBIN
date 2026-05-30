---
name: migrate-to-skills
description: Cursor rule（.cursor/rules/*.mdc）と slash command（.cursor/commands/*.md）を Agent Skills 形式（.cursor/skills/）へ変換します。rule や command を skill へ migrate、.mdc rule を SKILL.md 形式へ変換、command を skills directory に統合したいときに使います。
disable-model-invocation: true
---
# rule と slash command から skill への移行

Cursor rule（"Applied intelligently"）と slash command を Agent Skills 形式へ変換します。

**CRITICAL: body content を正確に保持してください。modify、reformat、「改善」はせず — verbatim でコピーします。**

## Locations

| Level | Source | Destination |
|-------|--------|-------------|
| Project | `{workspaceFolder}/**/.cursor/rules/*.mdc`, `{workspaceFolder}/.cursor/commands/*.md` |
| User | `~/.cursor/commands/*.md` |

Notes:
- project 内の Cursor rule は nested directory に置ける場合があります。徹底的に検索し、glob pattern で見つけてください。
- `~/.cursor/worktrees` 内は無視
- `~/.cursor/skills-cursor` 内は無視。Cursor internal built-in skill 用で、system が自動管理します。

## 移行対象 File の見つけ方

**Rules**: `description` があり、`globs` がなく、`alwaysApply: true` でもない rule を migrate。

**Commands**: すべて migrate — frontmatter なし plain markdown。

## Conversion Format

### Rules: .mdc → SKILL.md

```markdown
# Before: .cursor/rules/my-rule.mdc
---
description: What this rule does
globs:
alwaysApply: false
---
# Title
Body content...
```

```markdown
# After: .cursor/skills/my-rule/SKILL.md
---
name: my-rule
description: What this rule does
---
# Title
Body content...
```

Changes: `name` field を追加、`globs`/`alwaysApply` を削除、body はそのまま。

### Commands: .md → SKILL.md

```markdown
# Before: .cursor/commands/commit.md
# Commit current work
Instructions here...
```

```markdown
# After: .cursor/skills/commit/SKILL.md
---
name: commit
description: Commit current work with standardized message format
disable-model-invocation: true
---
# Commit current work
Instructions here...
```

Changes: frontmatter に `name`（filename から）、`description`（content から推測）、`disable-model-invocation: true` を追加、body はそのまま。

**Note:** `disable-model-invocation: true` は model の自動 invoke を防ぎます。slash command は `/` menu からユーザーが明示的に trigger する設計であり、model が自動提案するものではありません。

## Notes

- `name` は小文字とハイフンのみ
- `description` は skill discovery に critical
- migrate 動作確認後、必要なら original を削除

### Rule を migrate（.mdc → SKILL.md）

1. rule file を読む
2. frontmatter から `description` を extract
3. body content を extract（frontmatter 閉じ `---` 以降すべて）
4. skill directory を作成: `.cursor/skills/{skill-name}/`（skill name = .mdc なし filename）
5. 新 frontmatter（`name` と `description`）+ **EXACT** original body content で `SKILL.md` を書く（whitespace、formatting、code block を verbatim 保持）
6. original rule file を削除

### Command を migrate（.md → SKILL.md）

1. command file を読む
2. 最初の heading から description を extract（`#` prefix を除去）
3. skill directory を作成: `.cursor/skills/{skill-name}/`（skill name = .md なし filename）
4. 新 frontmatter（`name`、`description`、`disable-model-invocation: true`）+ 空行 + **EXACT** original file content で `SKILL.md` を書く（whitespace、formatting、code block を verbatim 保持）
5. original command file を削除

**CRITICAL: body content を character-for-character でコピー。reformat、typo 修正、「改善」はしない。**

## ワークフロー

Task tool が使える場合:
すべての file を自分で読み始めないでください。その作業は subagent に delegate します。あなたの役割は category ごとに subagent を dispatch し、結果を待つことです。

1. [ ] skills directory がなければ作成（project: `.cursor/skills/`、user: `~/.cursor/skills/`）
2. 3 つの fast general purpose subagent（explore ではない）を parallel dispatch し、project rules（pattern: `{workspaceFolder}/**/.cursor/rules/*.mdc`）、user commands（pattern: `~/.cursor/commands/*.md`）、project commands（pattern: `{workspaceFolder}/**/.cursor/commands/*.md`）について次を実行:
  I. [ ] 指定 pattern で migrate 対象 file を見つける
  II. [ ] rule の場合、"applied intelligently" rule か確認（`description` あり、`globs` なし、`alwaysApply: true` なし）。command は常に migrate。terminal で file を読まない。read tool を使う。
  III. [ ] migrate 対象 list を作る。空なら完了。
  IV. [ ] 各 file について読み、body content を **EXACT** に保持して新 skill file を書く。terminal で書かない。edit tool を使う。
  V. [ ] original file を削除。terminal で削除しない。delete tool を使う。
  VI. [ ] migrate した skill file と original file path の list を返す。
3. [ ] すべての subagent 完了を待ち、結果をユーザーに要約。IMPORTANT: undo したい場合は依頼すればよいことを伝える。
4. [ ] ユーザーが undo を求めた場合、上記の逆操作で original file を復元。

Task tool が使えない場合:
1. [ ] skills directory がなければ作成（project: `.cursor/skills/`、user: `~/.cursor/skills/`）
2. [ ] project（`.cursor/`）と user（`~/.cursor/`）両方で migrate 対象 file を見つける
3. [ ] rule の場合、"applied intelligently" rule か確認（`description` あり、`globs` なし、`alwaysApply: true` なし）。command は常に migrate。terminal で file を読まない。read tool を使う。
4. [ ] migrate 対象 list を作る。空なら完了。
5. [ ] 各 file について読み、body content を **EXACT** に保持して新 skill file を書く。terminal で書かない。edit tool を使う。
6. [ ] original file を削除。terminal で削除しない。delete tool を使う。
7. [ ] 結果をユーザーに要約。IMPORTANT: undo したい場合は依頼すればよいことを伝える。
8. [ ] ユーザーが undo を求めた場合、上記の逆操作で original file を復元。
