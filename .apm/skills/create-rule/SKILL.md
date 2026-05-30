---
name: create-rule
description: 永続的な AI ガイダンス用の Cursor rule を作成します。rule 追加、コーディング標準、プロジェクト規約、file-specific パターン、RULE.md 作成、`.cursor/rules/` や AGENTS.md についての質問時に使います。
---
# Cursor rule の作成

`.cursor/rules/` に project rule を作成し、AI agent へ永続的な context を提供します。

## 要件の収集

rule 作成前に次を決めます:

1. **Purpose**: この rule で何を enforce または teach するか
2. **Scope**: 常に適用するか、特定 file のみか
3. **File patterns**: file-specific の場合、どの glob pattern か

### コンテキストからの推測

会話に context がある場合、議論内容から rule を推測できます。会話が distinct な topic や pattern を複数扱う場合、複数 rule を作成して構いません。context ですでに答えが分かっている redundant な質問は避けます。

### 必須の質問

ユーザーが scope を指定していない場合、次を尋ねます:
- 「この rule は常に適用しますか、特定 file 作業時のみですか？」

特定 file に言及があり、具体的 pattern が未指定の場合、次を尋ねます:
- 「どの file pattern に適用しますか？」（例: `**/*.ts`、`backend/**/*.py`）

file pattern の明確化は重要です。

AskQuestion tool が使える場合は、効率的に収集します。

---

## Rule File Format

rule は YAML frontmatter 付きの `.mdc` file です:

```
.cursor/rules/
  typescript-standards.mdc
  react-patterns.mdc
  api-conventions.mdc
```

### File Structure

```markdown
---
description: Brief description of what this rule does
globs: **/*.ts  # File pattern for file-specific rules
alwaysApply: false  # Set to true if rule should always apply
---

# Rule Title

Your rule content here...
```

### Frontmatter Fields

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | rule の内容（rule picker に表示） |
| `globs` | string | file pattern — 一致 file を開いているときに適用 |
| `alwaysApply` | boolean | true の場合、すべての session に適用 |

---

## Rule Configurations

### Always Apply

すべての会話に適用する universal standard の場合:

```yaml
---
description: Core coding standards for the project
alwaysApply: true
---
```

### Apply to Specific Files

特定 file type 作業時のみ適用する rule の場合:

```yaml
---
description: TypeScript conventions for this project
globs: **/*.ts
alwaysApply: false
---
```

---

## ベストプラクティス

### Rule は簡潔に

- **50 行未満**: rule は簡潔に要点だけ
- **1 rule 1 concern**: 大きい rule は focused な piece に分割
- **Actionable**: 明確な internal doc のように書く
- **Concrete examples**: 可能なら issue の直し方の具体例を示す

---

## Rule 例

### TypeScript Standards

```markdown
---
description: TypeScript coding standards
globs: **/*.ts
alwaysApply: false
---

# Error Handling

\`\`\`typescript
// ❌ BAD
try {
  await fetchData();
} catch (e) {}

// ✅ GOOD
try {
  await fetchData();
} catch (e) {
  logger.error('Failed to fetch', { error: e });
  throw new DataFetchError('Unable to retrieve data', { cause: e });
}
\`\`\`
```

### React Patterns

```markdown
---
description: React component patterns
globs: **/*.tsx
alwaysApply: false
---

# React Patterns

- Use functional components
- Extract custom hooks for reusable logic
- Colocate styles with components
```

---

## Checklist

- [ ] file が `.mdc` 形式で `.cursor/rules/` にある
- [ ] frontmatter が正しく設定されている
- [ ] content が 500 行未満
- [ ] concrete example を含む
