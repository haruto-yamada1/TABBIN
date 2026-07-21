# Skill 執筆 best practices

> Claude が発見し、うまく使える効果的な Skill の書き方を学ぶ。

良い Skill は簡潔で、構造がよく、実使用でテストされている。このガイドは、Claude が発見・活用できる Skill を書くための実践的な執筆判断を提供する。

Skill の仕組みの概念的背景は [Skills overview](/en/docs/agents-and-tools/agent-skills/overview) を参照。

## 核心原則

### 簡潔さが鍵

[context window](https://platform.claude.com/docs/en/build-with-claude/context-windows) は公共財。Skill は次を含む Claude が知る必要のあるすべてと context window を共有する:

* system prompt
* 会話履歴
* 他 Skill の metadata
* 実際のリクエスト

Skill 内のすべての token に即時コストがあるわけではない。起動時は全 Skill の metadata（name と description）だけが pre-load される。Claude は Skill が relevant になったときだけ SKILL.md を読み、追加ファイルは必要時のみ読む。ただし SKILL.md の簡潔さは依然重要: load 後は各 token が会話履歴や他 context と競合する。

**既定の前提**: Claude はすでに非常に賢い

Claude がまだ持っていない context だけを足す。各情報に問いかける:

* "Claude は本当にこの説明が必要か？"
* "Claude はこれを知っていると仮定できるか？"
* "この段落は token コストに見合うか？"

**良い例: 簡潔**（約 50 tokens）:

````markdown  theme={null}
## Extract PDF text

Use pdfplumber for text extraction:

```python
import pdfplumber

with pdfplumber.open("file.pdf") as pdf:
    text = pdf.pages[0].extract_text()
```
````

**悪い例: 冗長すぎ**（約 150 tokens）:

```markdown  theme={null}
## Extract PDF text

PDF (Portable Document Format) files are a common file format that contains
text, images, and other content. To extract text from a PDF, you'll need to
use a library. There are many libraries available for PDF processing, but we
recommend pdfplumber because it's easy to use and handles most cases well.
First, you'll need to install it using pip. Then you can use the code below...
```

簡潔版は Claude が PDF と library の仕組みを知っていると仮定する。

### 適切な自由度を設定

具体性のレベルをタスクの fragility と variability に合わせる。

**高い自由度**（テキストベース指示）:

使う場面:

* 複数アプローチが有効
* 判断が context 依存
* ヒューリスティックがアプローチを導く

例:

```markdown  theme={null}
## Code review process

1. Analyze the code structure and organization
2. Check for potential bugs or edge cases
3. Suggest improvements for readability and maintainability
4. Verify adherence to project conventions
```

**中程度の自由度**（パラメータ付き pseudocode または script）:

使う場面:

* 推奨パターンがある
* ある程度の variation が許容
* 設定が振る舞いに影響

例:

````markdown  theme={null}
## Generate report

Use this template and customize as needed:

```python
def generate_report(data, format="markdown", include_charts=True):
    # Process data
    # Generate output in specified format
    # Optionally include visualizations
```
````

**低い自由度**（特定 script、パラメータ少/なし）:

使う場面:

* 操作が fragile で error-prone
* 一貫性が critical
* 特定 sequence に従う必要

例:

````markdown  theme={null}
## Database migration

Run exactly this script:

```bash
python scripts/migrate.py --verify --backup
```

Do not modify the command or add additional flags.
````

**比喩**: Claude を path を探索する robot と考える:

* **両側が cliff の狭い橋**: 安全な進路は 1 つ。具体的 guardrail と exact 指示（低自由度）。例: exact sequence で走る database migration。
* **障害のない open field**: 成功への path は多数。一般方向を与え、最良 route を Claude に任せる（高自由度）。例: context が最良 approach を決める code review。

### 使う予定の全 model でテスト

Skill は model への追加として機能するため、効果は underlying model に依存。使う予定の全 model で Skill をテストする。

**model 別テスト観点**:

* **Claude Haiku**（高速、経済的）: Skill は十分な guidance を提供するか？
* **Claude Sonnet**（バランス）: Skill は明確で効率的か？
* **Claude Opus**（強力な推論）: Skill は over-explaining を避けているか？

Opus で完璧でも Haiku には詳細が必要かも。複数 model で使うなら、すべてで機能する指示を目指す。

## Skill 構成

<Note>
  **YAML Frontmatter**: SKILL.md frontmatter は 2 フィールドをサポート:

  * `name` - Skill の human-readable 名（最大 64 文字）
  * `description` - Skill が何をし、いつ使うかの 1 行説明（最大 1024 文字）

  完全な Skill 構成の詳細は [Skills overview](/en/docs/agents-and-tools/agent-skills/overview#skill-structure) を参照。
</Note>

### 命名規則

参照・議論しやすくするため、一貫した命名パターンを使う。**gerund 形**（動詞 + -ing）を Skill 名に推奨。Skill が提供する activity や capability を明確に述べる。

**良い命名例（gerund 形）**:

* "Processing PDFs"
* "Analyzing spreadsheets"
* "Managing databases"
* "Testing code"
* "Writing documentation"

**許容される代替**:

* 名詞句: "PDF Processing", "Spreadsheet Analysis"
* action-oriented: "Process PDFs", "Analyze Spreadsheets"

**避ける**:

* 曖昧な名: "Helper", "Utils", "Tools"
* 過度に generic: "Documents", "Data", "Files"
* skill コレクション内の不統一パターン

一貫した命名により:

* 文書や会話で Skill を参照しやすい
* 一目で Skill の内容が分かる
* 複数 Skill の整理・検索が容易
* プロフェッショナルで cohesive な skill library を維持

### 効果的な description の書き方

`description` フィールドは Skill 発見を可能にし、Skill が何をするかといつ使うかの両方を含めるべき。

<Warning>
  **常に三人称で書く**。description は system prompt に注入され、視点の不統一は発見問題を起こす。

  * **Good:** "Processes Excel files and generates reports"
  * **Avoid:** "I can help you process Excel files"
  * **Avoid:** "You can use this to process Excel files"
</Warning>

**具体的に、key term を含める**。Skill が何をするかと、使う具体的 trigger/context の両方。

各 Skill には description フィールドが 1 つ。description は skill 選択に critical: Claude は 100+ Skill から正しい Skill を選ぶために使う。description はいつこの Skill を選ぶか十分な detail を提供し、SKILL.md 残りは implementation detail。

効果的な例:

**PDF Processing skill:**

```yaml  theme={null}
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.
```

**Excel Analysis skill:**

```yaml  theme={null}
description: Analyze Excel spreadsheets, create pivot tables, generate charts. Use when analyzing Excel files, spreadsheets, tabular data, or .xlsx files.
```

**Git Commit Helper skill:**

```yaml  theme={null}
description: Generate descriptive commit messages by analyzing git diffs. Use when the user asks for help writing commit messages or reviewing staged changes.
```

次のような曖昧 description は避ける:

```yaml  theme={null}
description: Helps with documents
```

```yaml  theme={null}
description: Processes data
```

```yaml  theme={null}
description: Does stuff with files
```

### Progressive disclosure パターン

SKILL.md は onboarding guide の目次のように、必要に応じて Claude を詳細 material へ導く overview として機能する。progressive disclosure の仕組みは overview の [How Skills work](/en/docs/agents-and-tools/agent-skills/overview#how-skills-work) を参照。

**実践ガイダンス:**

* 最適 performance のため SKILL.md 本文は 500 行未満
* この limit に近づいたら content を別 file に分割
* 下記パターンで instruction、code、resource を効果的に整理

#### 視覚 overview: シンプルから複雑へ

基本 Skill は metadata と instruction を含む SKILL.md のみから始まる:

<img src="https://mintcdn.com/anthropic-claude-docs/4Bny2bjzuGBK7o00/images/agent-skills-simple-file.png?fit=max&auto=format&n=4Bny2bjzuGBK7o00&q=85&s=87782ff239b297d9a9e8e1b72ed72db9" alt="Simple SKILL.md file showing YAML frontmatter and markdown body" data-og-width="2048" width="2048" data-og-height="1153" height="1153" data-path="images/agent-skills-simple-file.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/anthropic-claude-docs/4Bny2bjzuGBK7o00/images/agent-skills-simple-file.png?w=280&fit=max&auto=format&n=4Bny2bjzuGBK7o00&q=85&s=c61cc33b6f5855809907f7fda94cd80e 280w, https://mintcdn.com/anthropic-claude-docs/4Bny2bjzuGBK7o00/images/agent-skills-simple-file.png?w=560&fit=max&auto=format&n=4Bny2bjzuGBK7o00&q=85&s=90d2c0c1c76b36e8d485f49e0810dbfd 560w, https://mintcdn.com/anthropic-claude-docs/4Bny2bjzuGBK7o00/images/agent-skills-simple-file.png?w=840&fit=max&auto=format&n=4Bny2bjzuGBK7o00&q=85&s=ad17d231ac7b0bea7e5b4d58fb4aeabb 840w, https://mintcdn.com/anthropic-claude-docs/4Bny2bjzuGBK7o00/images/agent-skills-simple-file.png?w=1100&fit=max&auto=format&n=4Bny2bjzuGBK7o00&q=85&s=f5d0a7a3c668435bb0aee9a3a8f8c329 1100w, https://mintcdn.com/anthropic-claude-docs/4Bny2bjzuGBK7o00/images/agent-skills-simple-file.png?w=1650&fit=max&auto=format&n=4Bny2bjzuGBK7o00&q=85&s=0e927c1af9de5799cfe557d12249f6e6 1650w, https://mintcdn.com/anthropic-claude-docs/4Bny2bjzuGBK7o00/images/agent-skills-simple-file.png?w=2500&fit=max&auto=format&n=4Bny2bjzuGBK7o00&q=85&s=46bbb1a51dd4c8202a470ac8c80a893d 2500w" />

Skill が成長すると、Claude が必要時のみ load する追加 content を bundle できる:

<img src="https://mintcdn.com/anthropic-claude-docs/4Bny2bjzuGBK7o00/images/agent-skills-bundling-content.png?fit=max&auto=format&n=4Bny2bjzuGBK7o00&q=85&s=a5e0aa41e3d53985a7e3e43668a33ea3" alt="Bundling additional reference files like reference.md and forms.md." data-og-width="2048" width="2048" data-og-height="1327" height="1327" data-path="images/agent-skills-bundling-content.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/anthropic-claude-docs/4Bny2bjzuGBK7o00/images/agent-skills-bundling-content.png?w=280&fit=max&auto=format&n=4Bny2bjzuGBK7o00&q=85&s=f8a0e73783e99b4a643d79eac86b70a2 280w, https://mintcdn.com/anthropic-claude-docs/4Bny2bjzuGBK7o00/images/agent-skills-bundling-content.png?w=560&fit=max&auto=format&n=4Bny2bjzuGBK7o00&q=85&s=dc510a2a9d3f14359416b706f067904a 560w, https://mintcdn.com/anthropic-claude-docs/4Bny2bjzuGBK7o00/images/agent-skills-bundling-content.png?w=840&fit=max&auto=format&n=4Bny2bjzuGBK7o00&q=85&s=82cd6286c966303f7dd914c28170e385 840w, https://mintcdn.com/anthropic-claude-docs/4Bny2bjzuGBK7o00/images/agent-skills-bundling-content.png?w=1100&fit=max&auto=format&n=4Bny2bjzuGBK7o00&q=85&s=56f3be36c77e4fe4b523df209a6824c6 1100w, https://mintcdn.com/anthropic-claude-docs/4Bny2bjzuGBK7o00/images/agent-skills-bundling-content.png?w=1650&fit=max&auto=format&n=4Bny2bjzuGBK7o00&q=85&s=d22b5161b2075656417d56f41a74f3dd 1650w, https://mintcdn.com/anthropic-claude-docs/4Bny2bjzuGBK7o00/images/agent-skills-bundling-content.png?w=2500&fit=max&auto=format&n=4Bny2bjzuGBK7o00&q=85&s=3dd4bdd6850ffcc96c6c45fcb0acd6eb 2500w" />

完全な Skill ディレクトリ構成の例:

```text
pdf/
├── SKILL.md              # Main instructions (loaded when triggered)
├── FORMS.md              # Form-filling guide (loaded as needed)
├── reference.md          # API reference (loaded as needed)
├── examples.md           # Usage examples (loaded as needed)
└── scripts/
    ├── analyze_form.py   # Utility script (executed, not loaded)
    ├── fill_form.py      # Form filling script
    └── validate.py       # Validation script
```

#### パターン 1: リファレンス付き high-level guide

````markdown  theme={null}
---
name: PDF Processing
description: Extracts text and tables from PDF files, fills forms, and merges documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.
---

# PDF Processing

## Quick start

Extract text with pdfplumber:
```python
import pdfplumber
with pdfplumber.open("file.pdf") as pdf:
    text = pdf.pages[0].extract_text()
```

## Advanced features

**Form filling**: See [FORMS.md](FORMS.md) for complete guide
**API reference**: See [REFERENCE.md](REFERENCE.md) for all methods
**Examples**: See [EXAMPLES.md](EXAMPLES.md) for common patterns
````

Claude は FORMS.md、REFERENCE.md、EXAMPLES.md を必要時のみ load。

#### パターン 2: ドメイン別整理

複数ドメインの Skill では、無関係 context を load しないようドメイン別に整理。ユーザーが sales metrics を聞いたとき、Claude は finance や marketing ではなく sales schema だけ読む必要がある。token 使用を低く、context を focused に保つ。

```text
bigquery-skill/
├── SKILL.md (overview and navigation)
└── reference/
    ├── finance.md (revenue, billing metrics)
    ├── sales.md (opportunities, pipeline)
    ├── product.md (API usage, features)
    └── marketing.md (campaigns, attribution)
```

````markdown SKILL.md theme={null}
# BigQuery Data Analysis

## Available datasets

**Finance**: Revenue, ARR, billing → See [reference/finance.md](reference/finance.md)
**Sales**: Opportunities, pipeline, accounts → See [reference/sales.md](reference/sales.md)
**Product**: API usage, features, adoption → See [reference/product.md](reference/product.md)
**Marketing**: Campaigns, attribution, email → See [reference/marketing.md](reference/marketing.md)

## Quick search

Find specific metrics using grep:

```bash
grep -i "revenue" reference/finance.md
grep -i "pipeline" reference/sales.md
grep -i "api usage" reference/product.md
```
````

#### パターン 3: 条件付き detail

基本 content を示し、advanced content へ link:

```markdown  theme={null}
# DOCX Processing

## Creating documents

Use docx-js for new documents. See [DOCX-JS.md](DOCX-JS.md).

## Editing documents

For simple edits, modify the XML directly.

**For tracked changes**: See [REDLINING.md](REDLINING.md)
**For OOXML details**: See [OOXML.md](OOXML.md)
```

Claude はユーザーがそれら機能を必要とするときだけ REDLINING.md や OOXML.md を読む。

### 深くネストした参照を避ける

file が他の参照 file から参照されると、Claude は部分的に読むことがある。ネスト参照では `head -100` などで preview し、不完全な情報になることがある。

**参照は SKILL.md から 1 レベル深さに保つ**。すべての reference file は SKILL.md から直接 link し、必要時に Claude が完全 file を読むようにする。

**悪い例: 深すぎ**:

```markdown  theme={null}
# SKILL.md
See [advanced.md](advanced.md)...

# advanced.md
See [details.md](details.md)...

# details.md
Here's the actual information...
```

**良い例: 1 レベル深さ**:

```markdown  theme={null}
# SKILL.md

**Basic usage**: [instructions in SKILL.md]
**Advanced features**: See [advanced.md](advanced.md)
**API reference**: See [reference.md](reference.md)
**Examples**: See [examples.md](examples.md)
```

### 長い reference file には目次を置く

100 行超の reference file には先頭に目次。partial read でも利用可能情報の全体 scope が Claude に見える。

**例**:

```markdown  theme={null}
# API Reference

## Contents
- Authentication and setup
- Core methods (create, read, update, delete)
- Advanced features (batch operations, webhooks)
- Error handling patterns
- Code examples

## Authentication and setup
...

## Core methods
...
```

Claude は完全 file を読むか、必要 section に jump できる。

filesystem ベース architecture が progressive disclosure を可能にする詳細は、下記 Advanced 節の [Runtime environment](#runtime-environment) を参照。

## Workflow と feedback loop

### 複雑タスクに workflow を使う

複雑操作を明確な sequential step に分解。特に複雑な workflow では、Claude が response に copy して進捗を check off できる checklist を提供。

**例 1: Research synthesis workflow**（code なし Skill 向け）:

````markdown  theme={null}
## Research synthesis workflow

Copy this checklist and track your progress:

```
Research Progress:
- [ ] Step 1: Read all source documents
- [ ] Step 2: Identify key themes
- [ ] Step 3: Cross-reference claims
- [ ] Step 4: Create structured summary
- [ ] Step 5: Verify citations
```

**Step 1: Read all source documents**

Review each document in the `sources/` directory. Note the main arguments and supporting evidence.

**Step 2: Identify key themes**

Look for patterns across sources. What themes appear repeatedly? Where do sources agree or disagree?

**Step 3: Cross-reference claims**

For each major claim, verify it appears in the source material. Note which source supports each point.

**Step 4: Create structured summary**

Organize findings by theme. Include:
- Main claim
- Supporting evidence from sources
- Conflicting viewpoints (if any)

**Step 5: Verify citations**

Check that every claim references the correct source document. If citations are incomplete, return to Step 3.
````

この例は code 不要の分析タスクへの workflow 適用を示す。checklist パターンは任意の複雑 multi-step プロセスに使える。

**例 2: PDF form filling workflow**（code 付き Skill 向け）:

````markdown  theme={null}
## PDF form filling workflow

Copy this checklist and check off items as you complete them:

```
Task Progress:
- [ ] Step 1: Analyze the form (run analyze_form.py)
- [ ] Step 2: Create field mapping (edit fields.json)
- [ ] Step 3: Validate mapping (run validate_fields.py)
- [ ] Step 4: Fill the form (run fill_form.py)
- [ ] Step 5: Verify output (run verify_output.py)
```

**Step 1: Analyze the form**

Run: `python scripts/analyze_form.py input.pdf`

This extracts form fields and their locations, saving to `fields.json`.

**Step 2: Create field mapping**

Edit `fields.json` to add values for each field.

**Step 3: Validate mapping**

Run: `python scripts/validate_fields.py fields.json`

Fix any validation errors before continuing.

**Step 4: Fill the form**

Run: `python scripts/fill_form.py input.pdf fields.json output.pdf`

**Step 5: Verify output**

Run: `python scripts/verify_output.py output.pdf`

If verification fails, return to Step 2.
````

明確な step で Claude が critical validation を skip するのを防ぐ。checklist は multi-step workflow の進捗を Claude とあなたの両方が追跡するのに役立つ。

### feedback loop を実装

**よくあるパターン**: validator 実行 → エラー修正 → 繰り返し

このパターンは出力品質を大きく向上させる。

**例 1: Style guide compliance**（code なし Skill 向け）:

```markdown  theme={null}
## Content review process

1. Draft your content following the guidelines in STYLE_GUIDE.md
2. Review against the checklist:
   - Check terminology consistency
   - Verify examples follow the standard format
   - Confirm all required sections are present
3. If issues found:
   - Note each issue with specific section reference
   - Revise the content
   - Review the checklist again
4. Only proceed when all requirements are met
5. Finalize and save the document
```

script の代わりに reference 文書を使う validation loop パターン。 "validator" は STYLE_GUIDE.md で、Claude は読み取り比較で check する。

**例 2: Document editing process**（code 付き Skill 向け）:

```markdown  theme={null}
## Document editing process

1. Make your edits to `word/document.xml`
2. **Validate immediately**: `python ooxml/scripts/validate.py unpacked_dir/`
3. If validation fails:
   - Review the error message carefully
   - Fix the issues in the XML
   - Run validation again
4. **Only proceed when validation passes**
5. Rebuild: `python ooxml/scripts/pack.py unpacked_dir/ output.docx`
6. Test the output document
```

validation loop はエラーを早期捕捉。

## Content ガイドライン

### 時間敏感情報を避ける

古くなる情報を含めない:

**悪い例: 時間敏感**（やがて誤る）:

```markdown  theme={null}
If you're doing this before August 2025, use the old API.
After August 2025, use the new API.
```

**良い例**（"old patterns" 節を使う）:

```markdown  theme={null}
## Current method

Use the v2 API endpoint: `api.example.com/v2/messages`

## Old patterns

<details>
<summary>Legacy v1 API (deprecated 2025-08)</summary>

The v1 API used: `api.example.com/v1/messages`

This endpoint is no longer supported.
</details>
```

old patterns 節は main content を clutter せず歴史的 context を提供。

### 用語を一貫させる

1 つの term を選び Skill 全体で使う:

**良い — 一貫**:

* Always "API endpoint"
* Always "field"
* Always "extract"

**悪い — 不統一**:

* Mix "API endpoint", "URL", "API route", "path"
* Mix "field", "box", "element", "control"
* Mix "extract", "pull", "get", "retrieve"

一貫性は Claude の理解と指示遵守を助ける。

## よくあるパターン

### Template パターン

出力形式の template を提供。必要な厳密さに合わせる。

**厳密要件向け**（API response や data format など）:

````markdown  theme={null}
## Report structure

ALWAYS use this exact template structure:

```markdown
# [Analysis Title]

## Executive summary
[One-paragraph overview of key findings]

## Key findings
- Finding 1 with supporting data
- Finding 2 with supporting data
- Finding 3 with supporting data

## Recommendations
1. Specific actionable recommendation
2. Specific actionable recommendation
```
````

**柔軟ガイダンス向け**（adaptation が有用なとき）:

````markdown  theme={null}
## Report structure

Here is a sensible default format, but use your best judgment based on the analysis:

```markdown
# [Analysis Title]

## Executive summary
[Overview]

## Key findings
[Adapt sections based on what you discover]

## Recommendations
[Tailor to the specific context]
```

Adjust sections as needed for the specific analysis type.
````

### Examples パターン

出力品質が example 依存の Skill では、通常 prompting と同様 input/output ペアを提供:

````markdown  theme={null}
## Commit message format

Generate commit messages following these examples:

**Example 1:**
Input: Added user authentication with JWT tokens
Output:
```
feat(auth): implement JWT-based authentication

Add login endpoint and token validation middleware
```

**Example 2:**
Input: Fixed bug where dates displayed incorrectly in reports
Output:
```
fix(reports): correct date formatting in timezone conversion

Use UTC timestamps consistently across report generation
```

**Example 3:**
Input: Updated dependencies and refactored error handling
Output:
```
chore: update dependencies and refactor error handling

- Upgrade lodash to 4.17.21
- Standardize error response format across endpoints
```

Follow this style: type(scope): brief description, then detailed explanation.
````

Example は説明だけより望ましい style と detail レベルを Claude に伝える。

### Conditional workflow パターン

判断点で Claude を導く:

```markdown  theme={null}
## Document modification workflow

1. Determine the modification type:

   **Creating new content?** → Follow "Creation workflow" below
   **Editing existing content?** → Follow "Editing workflow" below

2. Creation workflow:
   - Use docx-js library
   - Build document from scratch
   - Export to .docx format

3. Editing workflow:
   - Unpack existing document
   - Modify XML directly
   - Validate after each change
   - Repack when complete
```

<Tip>
  workflow が大きく複雑化し step が多い場合、別 file に分け、タスクに応じて適切 file を読むよう Claude に指示することを検討。
</Tip>

## 評価と反復

### 先に evaluation を作る

**広範な文書を書く前に evaluation を作成。** Skill が imagined 問題ではなく real 問題を解くことを保証。

**Evaluation-driven development:**

1. **gap 特定**: 代表 task で Skill なし Claude を実行。具体的 failure や missing context を記録
2. **evaluation 作成**: これら gap を test する 3 scenario
3. **baseline 確立**: Skill なし performance を測定
4. **最小 instruction 執筆**: gap に対処し evaluation を pass する最小 content
5. **反復**: evaluation 実行、baseline 比較、refine

実際に起こりうる問題を解き、materialize しないかもしれない requirement を anticipate しない。

**Evaluation 構成**:

```json  theme={null}
{
  "skills": ["pdf-processing"],
  "query": "Extract all text from this PDF file and save it to output.txt",
  "files": ["test-files/document.pdf"],
  "expected_behavior": [
    "Successfully reads the PDF file using an appropriate PDF processing library or command-line tool",
    "Extracts text content from all pages in the document without missing any pages",
    "Saves the extracted text to a file named output.txt in a clear, readable format"
  ]
}
```

<Note>
  この例は simple testing rubric 付き data-driven evaluation。built-in evaluation 実行は現時点提供なし。ユーザーは独自 evaluation system を作れる。Evaluation は Skill 効果測定の source of truth。
</Note>

### Claude と反復的に Skill を開発

最も効果的な Skill 開発は Claude 自体を含む。Claude instance 1 つ（"Claude A"）と Skill 設計し、他 instance（"Claude B"）が real task で test。Claude A は instruction 設計・refine、Claude B は real task で test。Claude model は effective agent instruction の書き方と agent が必要とする情報の両方を理解する。

**新 Skill 作成:**

1. **Skill なしで task 完了**: Claude A と通常 prompting で problem を解く。作業中に自然と context、preference、手順知識を提供。繰り返し提供する情報に注目。

2. **再利用可能 pattern 特定**: 完了後、類似 future task に有用な context を特定。

   **例**: BigQuery 分析なら table 名、field 定義、filter ルール（"always exclude test accounts"）、common query pattern を提供していたかも。

3. **Claude A に Skill 作成依頼**: "Create a Skill that captures this BigQuery analysis pattern we just used. Include the table schemas, naming conventions, and the rule about filtering test accounts."

   <Tip>
     Claude model は Skill format と structure をネイティブ理解。special system prompt や "writing skills" skill なしで Skill 作成支援可能。Skill 作成を依頼すれば適切 frontmatter と body の SKILL.md を生成。
   </Tip>

4. **簡潔さ review**: Claude A が不要説明を足していないか確認。"Remove the explanation about what win rate means - Claude already knows that." と依頼。

5. **情報 architecture 改善**: content を効果的に整理依頼。例: "Organize this so the table schema is in a separate reference file. We might add more tables later."

6. **類似 task で test**: Claude B（Skill load 済 fresh instance）で関連 use case を test。正しい情報発見、rule 適用、task 成功を観察。

7. **観察に基づき反復**: Claude B が struggle/miss なら Claude A に具体例: "When Claude used this Skill, it forgot to filter by date for Q4. Should we add a section about date filtering patterns?"

**既存 Skill の反復:**

Skill 改善も同じ階層パターン:

* **Claude A と作業**（Skill refine の expert）
* **Claude B で test**（Skill を使う agent）
* **Claude B の行動観察** → Claude A へ insight

1. **real workflow で Skill 使用**: Claude B（Skill load）に test scenario ではなく actual task

2. **Claude B の行動観察**: struggle、成功、予期しない選択を記録

   **観察例**: "When I asked Claude B for a regional sales report, it wrote the query but forgot to filter out test accounts, even though the Skill mentions this rule."

3. **Claude A へ improvement 依頼**: 現 SKILL.md と観察を共有。"I noticed Claude B forgot to filter test accounts when I asked for a regional report. The Skill mentions filtering, but maybe it's not prominent enough?"

4. **Claude A の提案 review**: rule を目立たせる再構成、"always filter" を "MUST filter" に、workflow section 再構成など。

5. **変更 apply と test**: Claude A の refine で Skill 更新、類似 request で Claude B 再 test

6. **usage に基づき repeat**: 新 scenario ごと observe-refine-test。各反復は assumption ではなく real agent behavior に基づく。

**チーム feedback 収集:**

1. teammate と Skill 共有、usage 観察
2. 質問: 期待時に activate？ instruction 明確？ 不足は？
3. feedback で blind spot を補う

**このアプローチが効く理由**: Claude A は agent 需要を理解、あなたは domain expertise、Claude B は real usage で gap を露呈、反復 refine は assumption ではなく observed behavior で Skill 改善。

### Claude が Skill をどう navigate するか観察

Skill 反復時、Claude の実際の使い方に注目:

* **予期しない探索 path**: 想定外順序で file 読み？ structure が直感的でない可能性
* **Missed connections**: 重要 file 参照を follow しない？ link をより explicit/prominent に
* **特定 section への overreliance**: 同 file を繰り返し読む？ main SKILL.md に移すべき content かも
* **Ignored content**: bundled file にアクセスしない？ 不要か main instruction で poorly signaled

assumption ではなくこれらの観察で反復。Skill metadata の `name` と `description` は特に critical。Claude は current task への response で Skill trigger 可否をこれで判断。Skill が何をし、いつ使うかを明確に述べる。

## 避けるべきアンチパターン

### Windows 形式 path を避ける

file path は Windows でも常に forward slash:

* ✓ **Good**: `scripts/helper.py`, `reference/guide.md`
* ✗ **Avoid**: `scripts\helper.py`, `reference\guide.md`

Unix 形式 path は全 platform で動作。Windows 形式は Unix で error。

### 選択肢を出しすぎない

必要でなければ複数 approach を提示しない:

````markdown  theme={null}
**Bad example: Too many choices** (confusing):
"You can use pypdf, or pdfplumber, or PyMuPDF, or pdf2image, or..."

**Good example: Provide a default** (with escape hatch):
"Use pdfplumber for text extraction:
```python
import pdfplumber
```

For scanned PDFs requiring OCR, use pdf2image with pytesseract instead."
````

## Advanced: 実行可能 code 付き Skill

以下は実行 script を含む Skill 向け。markdown instruction のみの Skill は [効果的 Skill のチェックリスト](#効果的-skill-のチェックリスト) へ skip。

### 解決せよ、punt するな

Skill 用 script では error 条件を Claude に任せず handle。

**良い例: error を明示 handle**:

```python  theme={null}
def process_file(path):
    """Process a file, creating it if it doesn't exist."""
    try:
        with open(path) as f:
            return f.read()
    except FileNotFoundError:
        # Create file with default content instead of failing
        print(f"File {path} not found, creating default")
        with open(path, 'w') as f:
            f.write('')
        return ''
    except PermissionError:
        # Provide alternative instead of failing
        print(f"Cannot access {path}, using default")
        return ''
```

**悪い例: Claude に punt**:

```python  theme={null}
def process_file(path):
    # Just fail and let Claude figure it out
    return open(path).read()
```

configuration パラメータも justify し文書化し "voodoo constants"（Ousterhout's law）を避ける。正しい値が分からなければ Claude も決められない。

**良い例: 自己文書化**:

```python  theme={null}
# HTTP requests typically complete within 30 seconds
# Longer timeout accounts for slow connections
REQUEST_TIMEOUT = 30

# Three retries balances reliability vs speed
# Most intermittent failures resolve by the second retry
MAX_RETRIES = 3
```

**悪い例: Magic number**:

```python  theme={null}
TIMEOUT = 47  # Why 47?
RETRIES = 5   # Why 5?
```

### utility script を提供

Claude が script を書ける場合でも、pre-made script に利点:

**utility script の利点**:

* 生成 code より信頼性高い
* token 節約（context に code を含めない）
* 時間節約（code 生成不要）
* 使用間の一貫性

<img src="https://mintcdn.com/anthropic-claude-docs/4Bny2bjzuGBK7o00/images/agent-skills-executable-scripts.png?fit=max&auto=format&n=4Bny2bjzuGBK7o00&q=85&s=4bbc45f2c2e0bee9f2f0d5da669bad00" alt="Bundling executable scripts alongside instruction files" data-og-width="2048" width="2048" data-og-height="1154" height="1154" data-path="images/agent-skills-executable-scripts.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/anthropic-claude-docs/4Bny2bjzuGBK7o00/images/agent-skills-executable-scripts.png?w=280&fit=max&auto=format&n=4Bny2bjzuGBK7o00&q=85&s=9a04e6535a8467bfeea492e517de389f 280w, https://mintcdn.com/anthropic-claude-docs/4Bny2bjzuGBK7o00/images/agent-skills-executable-scripts.png?w=560&fit=max&auto=format&n=4Bny2bjzuGBK7o00&q=85&s=e49333ad90141af17c0d7651cca7216b 560w, https://mintcdn.com/anthropic-claude-docs/4Bny2bjzuGBK7o00/images/agent-skills-executable-scripts.png?w=840&fit=max&auto=format&n=4Bny2bjzuGBK7o00&q=85&s=954265a5df52223d6572b6214168c428 840w, https://mintcdn.com/anthropic-claude-docs/4Bny2bjzuGBK7o00/images/agent-skills-executable-scripts.png?w=1100&fit=max&auto=format&n=4Bny2bjzuGBK7o00&q=85&s=2ff7a2d8f2a83ee8af132b29f10150fd 1100w, https://mintcdn.com/anthropic-claude-docs/4Bny2bjzuGBK7o00/images/agent-skills-executable-scripts.png?w=1650&fit=max&auto=format&n=4Bny2bjzuGBK7o00&q=85&s=48ab96245e04077f4d15e9170e081cfb 1650w, https://mintcdn.com/anthropic-claude-docs/4Bny2bjzuGBK7o00/images/agent-skills-executable-scripts.png?w=2500&fit=max&auto=format&n=4Bny2bjzuGBK7o00&q=85&s=0301a6c8b3ee879497cc5b5483177c90 2500w" />

上図は executable script が instruction file と並ぶ仕組み。instruction file（forms.md）が script を参照し、Claude は content を context に load せず実行できる。

**重要な区別**: instruction で Claude がすべきことを明確に:

* **script 実行**（最も common）: "Run `analyze_form.py` to extract fields"
* **reference として読む**（複雑 logic）: "See `analyze_form.py` for the field extraction algorithm"

多くの utility script では実行が preferred — より信頼性高く効率的。script 実行の詳細は下記 [Runtime environment](#runtime-environment)。

**例**:

````markdown  theme={null}
## Utility scripts

**analyze_form.py**: Extract all form fields from PDF

```bash
python scripts/analyze_form.py input.pdf > fields.json
```

Output format:
```json
{
  "field_name": {"type": "text", "x": 100, "y": 200},
  "signature": {"type": "sig", "x": 150, "y": 500}
}
```

**validate_boxes.py**: Check for overlapping bounding boxes

```bash
python scripts/validate_boxes.py fields.json
# Returns: "OK" or lists conflicts
```

**fill_form.py**: Apply field values to PDF

```bash
python scripts/fill_form.py input.pdf fields.json output.pdf
```
````

### 視覚分析を使う

input を image に render できる場合、Claude に分析させる:

````markdown  theme={null}
## Form layout analysis

1. Convert PDF to images:
   ```bash
   python scripts/pdf_to_images.py form.pdf
   ```

2. Analyze each page image to identify form fields
3. Claude can see field locations and types visually
````

<Note>
  この例では `pdf_to_images.py` script を書く必要がある。
</Note>

Claude の vision capability は layout と structure 理解に役立つ。

### 検証可能な中間出力を作る

Claude が複雑で open-ended な task を行うと mistake しうる。"plan-validate-execute" パターンは、まず structured format で plan を作り、script で validate してから execute することで早期 error 捕捉。

**例**: spreadsheet に基づき PDF の 50 form field を更新依頼。validation なしでは存在しない field 参照、矛盾 value、必須 field 欠落、誤適用がありうる。

**解決**: 上記 PDF form filling workflow に、変更 apply 前に validate する中間 `changes.json` を追加。workflow: analyze → **plan file 作成** → **plan validate** → execute → verify。

**このパターンが効く理由:**

* **早期 error 捕捉**: validation が apply 前に問題発見
* **機械検証可能**: script が客観 verification
* **可逆 planning**: original に触れず plan 反復
* **明確 debug**: error message が specific 問題を指す

**使う場面**: batch 操作、破壊的変更、複雑 validation rule、high-stakes 操作。

**実装 tip**: validation script は verbose に、specific error message を。"Field 'signature\_date' not found. Available fields: customer\_name, order\_total, signature\_date\_signed" のように Claude の修正を助ける。

### 依存 package

Skill は platform 固有制限付き code execution environment で動作:

* **claude.ai**: npm、PyPI から package install、GitHub repo 取得可
* **Anthropic API**: network なし、runtime package install なし

必要 package を SKILL.md に列挙し、[code execution tool documentation](/en/docs/agents-and-tools/tool-use/code-execution-tool) で利用可能か確認。

### Runtime environment

Skill は filesystem access、bash command、code execution 付き code execution environment で動作。architecture の概念説明は overview の [The Skills architecture](/en/docs/agents-and-tools/agent-skills/overview#the-skills-architecture) を参照。

**執筆への影響:**

**Claude の Skill アクセス:**

1. **Metadata pre-load**: 起動時、全 Skill の YAML frontmatter から name と description が system prompt に load
2. **File on-demand read**: Claude は bash Read tool で filesystem から SKILL.md 等を必要時 access
3. **Script 効率実行**: utility script は full content を context に load せず bash 実行可能。script output のみ token 消費
4. **大 file への context penalty なし**: reference、data、documentation は実際に read するまで context token 消費しない

* **File path が重要**: Claude は skill directory を filesystem のように navigate。backslash ではなく forward slash（`reference/guide.md`）
* **記述的 file 名**: content を示す名: `form_validation_rules.md` not `doc2.md`
* **discovery 向け整理**: domain または feature で directory 構成
  * Good: `reference/finance.md`, `reference/sales.md`
  * Bad: `docs/file1.md`, `docs/file2.md`
* **包括 resource を bundle**: 完全 API docs、extensive example、大 dataset。access まで context penalty なし
* **deterministic 操作は script 優先**: validation code 生成依頼より `validate_form.py` を書く
* **Make execution intent clear**:
  * "Run `analyze_form.py` to extract fields" (execute)
  * "See `analyze_form.py` for the extraction algorithm" (read as reference)
* **file access pattern を test**: real request で directory structure を navigate できるか確認

**例:**

```text
bigquery-skill/
├── SKILL.md (overview, points to reference files)
└── reference/
    ├── finance.md (revenue metrics)
    ├── sales.md (pipeline data)
    └── product.md (usage analytics)
```

ユーザーが revenue について聞くと、Claude は SKILL.md を読み `reference/finance.md` 参照を見つけ bash でその file だけ invoke。sales.md と product.md は filesystem に残り、必要まで zero context token。filesystem モデルが progressive disclosure を可能にする。technical architecture 詳細は Skills overview の [How Skills work](/en/docs/agents-and-tools/agent-skills/overview#how-skills-work) を参照。

### MCP tool 参照

Skill が MCP (Model Context Protocol) tool を使う場合、 "tool not found" 回避のため fully qualified tool 名を常に使う。

**形式**: `ServerName:tool_name`

**例**:

```markdown  theme={null}
Use the BigQuery:bigquery_schema tool to retrieve table schemas.
Use the GitHub:create_issue tool to create issues.
```

ここで:

* `BigQuery` と `GitHub` は MCP server 名
* `bigquery_schema` と `create_issue` は各 server 内 tool 名

server prefix なしでは、特に複数 MCP server 利用時に Claude が tool を見つけられないことがある。

### tool が install 済みと仮定しない

package 利用可能を仮定しない:

````markdown  theme={null}
**Bad example: Assumes installation**:
"Use the pdf library to process the file."

**Good example: Explicit about dependencies**:
"Install required package: `pip install pypdf`

Then use it:
```python
from pypdf import PdfReader
reader = PdfReader("file.pdf")
```"
````

## 技術メモ

### YAML frontmatter 要件

SKILL.md frontmatter は `name`（最大 64 文字）と `description`（最大 1024 文字）のみ。完全構成は [Skills overview](/en/docs/agents-and-tools/agent-skills/overview#skill-structure) を参照。

### Token budget

最適 performance のため SKILL.md 本文は 500 行未満。超える場合は progressive disclosure パターンで別 file に分割。architecture 詳細は [Skills overview](/en/docs/agents-and-tools/agent-skills/overview#how-skills-work) を参照。

## 効果的 Skill のチェックリスト

Skill 共有前に確認:

### 核心品質

* [ ] Description が具体的で key term を含む
* [ ] Description に Skill が何をするかといつ使うかの両方
* [ ] SKILL.md 本文 500 行未満
* [ ] 追加 detail は別 file（必要時）
* [ ] 時間敏感情報なし（または "old patterns" 節）
* [ ] 用語一貫
* [ ] Example が concrete（abstract でない）
* [ ] File 参照は 1 レベル深さ
* [ ] Progressive disclosure を適切使用
* [ ] Workflow に clear step

### Code と script

* [ ] Script が punt せず problem を解く
* [ ] Error handling が explicit で有用
* [ ] "voodoo constants" なし（全 value justify）
* [ ] 必要 package を instruction に列挙し利用可能を確認
* [ ] Script に clear documentation
* [ ] Windows 形式 path なし（すべて forward slash）
* [ ] critical 操作に validation/verification step
* [ ] 品質 critical task に feedback loop

### テスト

* [ ] 少なくとも 3 evaluation 作成
* [ ] Haiku、Sonnet、Opus で test
* [ ] real usage scenario で test
* [ ] チーム feedback 反映（該当時）

## 次のステップ

<CardGroup cols={2}>
  <Card title="Get started with Agent Skills" icon="rocket" href="/en/docs/agents-and-tools/agent-skills/quickstart">
    Create your first Skill
  </Card>

  <Card title="Use Skills in Claude Code" icon="terminal" href="/en/docs/claude-code/skills">
    Create and manage Skills in Claude Code
  </Card>

  <Card title="Use Skills with the API" icon="code" href="/en/api/skills-guide">
    Upload and use Skills programmatically
  </Card>
</CardGroup>
