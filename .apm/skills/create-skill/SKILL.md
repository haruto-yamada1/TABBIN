---
name: create-skill
description: Cursor Agent Skill を作成します。新しい skill の執筆、SKILL.md 構造についての質問時に使います。
---
# Cursor skill の作成

Cursor 向けの effective Agent Skill 作成手順です。skill は markdown file で、agent に specific task の実行方法を教えます。例: team standard による PR review、好みの format での commit message 生成、database schema query、任意の specialized workflow など。

## 開始前: 要件の収集

skill 作成前に、ユーザーから次の essential information を収集します:

1. **Purpose and scope**: この skill が支援すべき specific task または workflow は何か
2. **Target location**: personal skill（~/.cursor/skills/）か project skill（.cursor/skills/）か
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
- "Where should this skill be stored?" with options like ["Personal (~/.cursor/skills/)", "Project (.cursor/skills/)"]
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
| Personal | ~/.cursor/skills/skill-name/ | Available across all your projects |
| Project | .cursor/skills/skill-name/ | Shared with anyone using the repository |

**IMPORTANT**: `~/.cursor/skills-cursor/` に skill を作らない。この directory は Cursor internal built-in skill 用で system が自動管理。

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

## 効果的な Description の書き方

description は skill discovery に **critical**。agent が skill 適用タイミングを決めるために使う。

### Description ベストプラクティス

1. **三人称で書く**（description は system prompt に inject される）:
   - ✅ Good: "Processes Excel files and generates reports"
   - ❌ Avoid: "I can help you process Excel files"
   - ❌ Avoid: "You can use this to process Excel files"

2. **具体的に trigger term を含める**:
   - ✅ Good: "Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction."
   - ❌ Vague: "Helps with documents"

3. **WHAT と WHEN の両方を含める**:
   - WHAT: skill が何をするか（specific capabilities）
   - WHEN: agent がいつ使うか（trigger scenarios）

### Description 例

```yaml
# PDF Processing
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.

# Excel Analysis
description: Analyze Excel spreadsheets, create pivot tables, generate charts. Use when analyzing Excel files, spreadsheets, tabular data, or .xlsx files.

# Git Commit Helper
description: Generate descriptive commit messages by analyzing git diffs. Use when the user asks for help writing commit messages or reviewing staged changes.

# Code Review
description: Review code for quality, security, and best practices following team standards. Use when reviewing pull requests, code changes, or when the user asks for a code review.
```

---

## Core Authoring Principles

### 1. Concise is Key

context window は conversation history、他 skill、request と共有。すべての token が space を競う。

**Default assumption**: agent はすでに very smart。持っていない context だけ追加。

各情報に challenge:
- "Does the agent really need this explanation?"
- "Can I assume the agent knows this?"
- "Does this paragraph justify its token cost?"

**Good (concise)**:
```markdown
## Extract PDF text

Use pdfplumber for text extraction:

\`\`\`python
import pdfplumber

with pdfplumber.open("file.pdf") as pdf:
    text = pdf.pages[0].extract_text()
\`\`\`
```

**Bad (verbose)**:
```markdown
## Extract PDF text

PDF (Portable Document Format) files are a common file format that contains
text, images, and other content. To extract text from a PDF, you'll need to
use a library. There are many libraries available for PDF processing, but we
recommend pdfplumber because it's easy to use and handles most cases well...
```

### 2. Keep SKILL.md Under 500 Lines

optimal performance のため main SKILL.md は concise に。詳細 content は progressive disclosure。

### 3. Progressive Disclosure

essential information を SKILL.md に。詳細 reference material は agent が必要時のみ読む separate file に。

```markdown
# PDF Processing

## Quick start
[Essential instructions here]

## Additional resources
- For complete API details, see [reference.md](reference.md)
- For usage examples, see [examples.md](examples.md)
```

**Keep references one level deep** — SKILL.md から reference file へ直接 link。deeply nested reference は partial read になりうる。

### 4. Set Appropriate Degrees of Freedom

task の fragility に合わせ specificity を調整:

| Freedom Level | When to Use | Example |
|---------------|-------------|---------|
| **High** (text instructions) | Multiple valid approaches, context-dependent | Code review guidelines |
| **Medium** (pseudocode/templates) | Preferred pattern with acceptable variation | Report generation |
| **Low** (specific scripts) | Fragile operations, consistency critical | Database migrations |

---

## Common Patterns

### Template Pattern

output format template を提供:

```markdown
## Report structure

Use this template:

\`\`\`markdown
# [Analysis Title]

## Executive summary
[One-paragraph overview of key findings]

## Key findings
- Finding 1 with supporting data
- Finding 2 with supporting data

## Recommendations
1. Specific actionable recommendation
2. Specific actionable recommendation
\`\`\`
```

### Examples Pattern

output quality が example 依存の skill:

```markdown
## Commit message format

**Example 1:**
Input: Added user authentication with JWT tokens
Output:
\`\`\`
feat(auth): implement JWT-based authentication

Add login endpoint and token validation middleware
\`\`\`

**Example 2:**
Input: Fixed bug where dates displayed incorrectly
Output:
\`\`\`
fix(reports): correct date formatting in timezone conversion

Use UTC timestamps consistently across report generation
\`\`\`
```

### Workflow Pattern

complex operation を clear step と checklist に分解:

```markdown
## Form filling workflow

Copy this checklist and track progress:

\`\`\`
Task Progress:
- [ ] Step 1: Analyze the form
- [ ] Step 2: Create field mapping
- [ ] Step 3: Validate mapping
- [ ] Step 4: Fill the form
- [ ] Step 5: Verify output
\`\`\`

**Step 1: Analyze the form**
Run: \`python scripts/analyze_form.py input.pdf\`
...
```

### Conditional Workflow Pattern

decision point を guide:

```markdown
## Document modification workflow

1. Determine the modification type:

   **Creating new content?** → Follow "Creation workflow" below
   **Editing existing content?** → Follow "Editing workflow" below

2. Creation workflow:
   - Use docx-js library
   - Build document from scratch
   ...
```

### Feedback Loop Pattern

quality-critical task では validation loop:

```markdown
## Document editing process

1. Make your edits
2. **Validate immediately**: \`python scripts/validate.py output/\`
3. If validation fails:
   - Review the error message
   - Fix the issues
   - Run validation again
4. **Only proceed when validation passes**
```

---

## Utility Scripts

pre-made script は generated code より有利:
- generated code より reliable
- token 節約（context に code 不要）
- 時間節約（code generation 不要）
- 使用間で consistency

```markdown
## Utility scripts

**analyze_form.py**: Extract all form fields from PDF
\`\`\`bash
python scripts/analyze_form.py input.pdf > fields.json
\`\`\`

**validate.py**: Check for errors
\`\`\`bash
python scripts/validate.py fields.json
# Returns: "OK" or lists conflicts
\`\`\`
```

agent が script を **execute** すべきか **read** して reference にすべきか明確に。

---

## Anti-Patterns to Avoid

### 1. Windows-Style Paths
- ✅ Use: `scripts/helper.py`
- ❌ Avoid: `scripts\helper.py`

### 2. Too Many Options
```markdown
# Bad - confusing
"You can use pypdf, or pdfplumber, or PyMuPDF, or..."

# Good - provide a default with escape hatch
"Use pdfplumber for text extraction.
For scanned PDFs requiring OCR, use pdf2image with pytesseract instead."
```

### 3. Time-Sensitive Information
```markdown
# Bad - will become outdated
"If you're doing this before August 2025, use the old API."

# Good - use an "old patterns" section
## Current method
Use the v2 API endpoint.

## Old patterns (deprecated)
<details>
<summary>Legacy v1 API</summary>
...
</details>
```

### 4. Inconsistent Terminology
1 term を選び throughout 使用:
- ✅ Always "API endpoint" (not mixing "URL", "route", "path")
- ✅ Always "field" (not mixing "box", "element", "control")

### 5. Vague Skill Names
- ✅ Good: `processing-pdfs`, `analyzing-spreadsheets`
- ❌ Avoid: `helper`, `utils`, `tools`

---

## Skill Creation Workflow

ユーザーが skill 作成を依頼した場合、この process に従う:

### Phase 1: Discovery

次について情報収集:
1. skill の purpose と primary use case
2. storage location（personal vs project）
3. trigger scenarios
4. specific requirement や constraint
5. 従う existing example や pattern

AskQuestion tool が使えれば structured gathering に使用。使えない場合は conversational に質問。

### Phase 2: Design

1. skill name を draft（lowercase、hyphens、max 64 chars）
2. specific な三人称 description を書く
3. 必要な main section を outline
4. supporting file や script が必要か特定

### Phase 3: Implementation

1. directory structure を作成
2. frontmatter 付き SKILL.md を書く
3. supporting reference file を作成
4. 必要な utility script を作成
5. TABBIN project skill を追加または削除した場合、`.apm/SKILLS.md` の skill 一覧にも用途を追記または削除します。

### Phase 4: Verification

1. SKILL.md が 500 行未満であることを verify
2. description が specific で trigger term を含むことを check
3. terminology が throughout 一貫していることを ensure
4. すべての file reference が one level deep であることを verify
5. skill が discover され apply できることを test
6. TABBIN project skill の場合、`.apm/SKILLS.md` に新しい skill が記載されていることを確認します。

---

## Complete Example

well-structured skill の complete example:

**Directory structure:**
```
code-review/
├── SKILL.md
├── STANDARDS.md
└── examples.md
```

**SKILL.md:**
```markdown
---
name: code-review
description: Review code for quality, security, and maintainability following team standards. Use when reviewing pull requests, examining code changes, or when the user asks for a code review.
---

# Code Review

## Quick Start

When reviewing code:

1. Check for correctness and potential bugs
2. Verify security best practices
3. Assess code readability and maintainability
4. Ensure tests are adequate

## Review Checklist

- [ ] Logic is correct and handles edge cases
- [ ] No security vulnerabilities (SQL injection, XSS, etc.)
- [ ] Code follows project style conventions
- [ ] Functions are appropriately sized and focused
- [ ] Error handling is comprehensive
- [ ] Tests cover the changes

## Providing Feedback

Format feedback as:
- 🔴 **Critical**: Must fix before merge
- 🟡 **Suggestion**: Consider improving
- 🟢 **Nice to have**: Optional enhancement

## Additional Resources

- For detailed coding standards, see [STANDARDS.md](STANDARDS.md)
- For example reviews, see [examples.md](examples.md)
```

---

## Summary Checklist

skill finalize 前に verify:

### Core Quality
- [ ] Description is specific and includes key terms
- [ ] Description includes both WHAT and WHEN
- [ ] Written in third person
- [ ] SKILL.md body is under 500 lines
- [ ] Consistent terminology throughout
- [ ] Examples are concrete, not abstract

### Structure
- [ ] File references are one level deep
- [ ] Progressive disclosure used appropriately
- [ ] Workflows have clear steps
- [ ] No time-sensitive information

### If Including Scripts
- [ ] Scripts solve problems rather than punt
- [ ] Required packages are documented
- [ ] Error handling is explicit and helpful
- [ ] No Windows-style paths
