---
name: create-subagent
description: 専門タスク用の custom subagent を作成します。新しい subagent 種別、task-specific agent、code reviewer、debugger、domain-specific assistant の設定、custom prompt 作成時に使います。
disable-model-invocation: true
---
# カスタム subagent の作成

Cursor 用 custom subagent 作成の手順です。subagent は isolated context で custom system prompt 付きの specialized AI assistant として動作します。

## Subagent を使うタイミング

subagent は次の用途に役立ちます:
- **Context を保全** — exploration を main conversation から分離
- **Behavior を specialize** — 特定 domain 向け focused system prompt
- **Configuration を再利用** — user-level subagent を project 横断で使う

### コンテキストからの推測

会話に context がある場合、議論内容から subagent の purpose と behavior を推測します。会話で出てきた specialized task や workflow に基づいて subagent を作成できます。

## Subagent Locations

| Location | Scope | Priority |
|----------|-------|----------|
| `.cursor/agents/` | Current project | Higher |
| `~/.cursor/agents/` | All your projects | Lower |

同名 subagent が複数ある場合、優先度の高い location が勝ちます。

**Project subagents**（`.cursor/agents/`）: codebase 固有 agent に最適。version control に commit して team と共有します。

**User subagents**（`~/.cursor/agents/`）: すべての project で使える personal agent。

## Subagent File Format

YAML frontmatter と markdown body（system prompt）付き `.md` file を作成します:

```markdown
---
name: code-reviewer
description: Reviews code for quality and best practices
---

You are a code reviewer. When invoked, analyze the code and provide
specific, actionable feedback on quality, security, and best practices.
```

### Required Fields

| Field | Description |
|-------|-------------|
| `name` | 一意 identifier（小文字とハイフンのみ） |
| `description` | この subagent に delegate するタイミング（具体的に！） |

## 効果的な description の書き方

description は **critical** — AI が delegate タイミングを決めるために使います。

```yaml
# ❌ Too vague
description: Helps with code

# ✅ Specific and actionable
description: Expert code review specialist. Proactively reviews code for quality, security, and maintainability. Use immediately after writing or modifying code.
```

自動 delegate を促す場合は "use proactively" を含めます。

## Subagent 例

### Code Reviewer

```markdown
---
name: code-reviewer
description: Expert code review specialist. Proactively reviews code for quality, security, and maintainability. Use immediately after writing or modifying code.
---

You are a senior code reviewer ensuring high standards of code quality and security.

When invoked:
1. Run git diff to see recent changes
2. Focus on modified files
3. Begin review immediately

Review checklist:
- Code is clear and readable
- Functions and variables are well-named
- No duplicated code
- Proper error handling
- No exposed secrets or API keys
- Input validation implemented
- Good test coverage
- Performance considerations addressed

Provide feedback organized by priority:
- Critical issues (must fix)
- Warnings (should fix)
- Suggestions (consider improving)

Include specific examples of how to fix issues.
```

### Debugger

```markdown
---
name: debugger
description: Debugging specialist for errors, test failures, and unexpected behavior. Use proactively when encountering any issues.
---

You are an expert debugger specializing in root cause analysis.

When invoked:
1. Capture error message and stack trace
2. Identify reproduction steps
3. Isolate the failure location
4. Implement minimal fix
5. Verify solution works

Debugging process:
- Analyze error messages and logs
- Check recent code changes
- Form and test hypotheses
- Add strategic debug logging
- Inspect variable states

For each issue, provide:
- Root cause explanation
- Evidence supporting the diagnosis
- Specific code fix
- Testing approach
- Prevention recommendations

Focus on fixing the underlying issue, not the symptoms.
```

### Data Scientist

```markdown
---
name: data-scientist
description: Data analysis expert for SQL queries, BigQuery operations, and data insights. Use proactively for data analysis tasks and queries.
---

You are a data scientist specializing in SQL and BigQuery analysis.

When invoked:
1. Understand the data analysis requirement
2. Write efficient SQL queries
3. Use BigQuery command line tools (bq) when appropriate
4. Analyze and summarize results
5. Present findings clearly

Key practices:
- Write optimized SQL queries with proper filters
- Use appropriate aggregations and joins
- Include comments explaining complex logic
- Format results for readability
- Provide data-driven recommendations

For each analysis:
- Explain the query approach
- Document any assumptions
- Highlight key findings
- Suggest next steps based on data

Always ensure queries are efficient and cost-effective.
```

## Subagent 作成ワークフロー

### Step 1: Scope を決める

- **Project-level**（`.cursor/agents/`）: team と共有する codebase 固有 agent
- **User-level**（`~/.cursor/agents/`）: すべての project 向け personal agent

### Step 2: File を作成

```bash
# For project-level
mkdir -p .cursor/agents
touch .cursor/agents/my-agent.md

# For user-level
mkdir -p ~/.cursor/agents
touch ~/.cursor/agents/my-agent.md
```

### Step 3: Configuration を定義

required field（`name` と `description`）付き frontmatter を書きます。

### Step 4: System Prompt を書く

body が system prompt になります。次を具体的に書きます:
- invoke 時に agent が何をするか
- 従う workflow または process
- output format と structure
- constraint や guideline

### Step 5: Agent をテスト

AI に新 agent の使用を依頼します:

```
Use the my-agent subagent to [task description]
```

## ベストプラクティス

1. **Focused subagent を設計**: 各 agent は 1 つの specific task に特化
2. **詳細な description を書く**: delegate タイミングが分かる trigger term を含める
3. **Version control に commit**: project subagent を team と共有
4. **Proactive な表現を使う**: description に "use proactively" を含める

## トラブルシューティング

### Subagent Not Found
- file が `.cursor/agents/` または `~/.cursor/agents/` にあることを確認
- file が `.md` extension であることを確認
- YAML frontmatter syntax が valid であることを確認
