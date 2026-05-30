---
name: receiving-code-review
description: コードレビューのフィードバックを受け取ったとき、特に内容が不明確または技術的に疑わしい場合に、実装前に使います。演技的な同意や盲従ではなく、技術的な検証が必要です。
---

# コードレビューの受領

## 概要

コードレビューには感情的な演技ではなく、技術的評価が必要です。

**核心原則:** 実装前に検証する。仮定の前に質問する。社会的な快適さより技術的正しさ。

## 応答パターン

```
WHEN receiving code review feedback:

1. READ: 反応せずにフィードバックを最後まで読む
2. UNDERSTAND: 自分の言葉で要件を言い換える（または質問）
3. VERIFY: コードベースの現実と照合
4. EVALUATE: このコードベースにとって技術的に妥当か？
5. RESPOND: 技術的な了承、または理由付き pushback
6. IMPLEMENT: 1 件ずつ、それぞれテスト
```

## 禁止応答

**絶対にやらない:**
- "You're absolutely right!"（CLAUDE.md 明示違反）
- "Great point!" / "Excellent feedback!"（演技的）
- "Let me implement that now"（検証前）

**代わりに:**
- 技術的要件を言い換える
- 明確化の質問
- 誤りなら技術的理由で push back
- 黙って作業を始める（行動 > 言葉）

## 不明確なフィードバックへの対応

```
IF any item is unclear:
  STOP - まだ何も実装しない
  ASK for clarification on unclear items

WHY: 項目は関連していることがある。部分的な理解 = 誤った実装。
```

**例:**
```
your human partner: "Fix 1-6"
You understand 1,2,3,6. Unclear on 4,5.

❌ WRONG: Implement 1,2,3,6 now, ask about 4,5 later
✅ RIGHT: "I understand items 1,2,3,6. Need clarification on 4 and 5 before proceeding."
```

## ソース別の扱い

### your human partner から
- **信頼できる** - 理解後に実装
- **スコープが不明なら質問**
- **演技的な同意はしない**
- **行動へ移るか、技術的に了承**

### 外部レビュアーから
```
BEFORE implementing:
  1. Check: このコードベースにとって技術的に正しいか？
  2. Check: 既存機能を壊さないか？
  3. Check: 現実装の理由は？
  4. Check: 全プラットフォーム/バージョンで動くか？
  5. Check: レビュアーは全体コンテキストを理解しているか？

IF suggestion seems wrong:
  Push back with technical reasoning

IF can't easily verify:
  Say so: "I can't verify this without [X]. Should I [investigate/ask/proceed]?"

IF conflicts with your human partner's prior decisions:
  Stop and discuss with your human partner first
```

**your human partner のルール:** "External feedback - be skeptical, but check carefully"

## 「プロ向け」機能の YAGNI チェック

```
IF reviewer suggests "implementing properly":
  grep codebase for actual usage

  IF unused: "This endpoint isn't called. Remove it (YAGNI)?"
  IF used: Then implement properly
```

**your human partner のルール:** "You and reviewer both report to me. If we don't need this feature, don't add it."

## 実装順序

```
FOR multi-item feedback:
  1. Clarify anything unclear FIRST
  2. Then implement in this order:
     - Blocking issues (breaks, security)
     - Simple fixes (typos, imports)
     - Complex fixes (refactoring, logic)
  3. Test each fix individually
  4. Verify no regressions
```

## push back するタイミング

次の場合に push back:
- 提案が既存機能を壊す
- レビュアーがコンテキスト不足
- YAGNI 違反（未使用機能）
- このスタックにとって技術的に誤り
- legacy / 互換性の理由がある
- your human partner のアーキテクチャ判断と矛盾

**push back の仕方:**
- 防御ではなく技術的理由
- 具体的な質問
- 動く test/code を参照
- アーキテクチャ問題なら your human partner を巻き込む

**口頭で push back しにくいときの合図:** "Strange things are afoot at the Circle K"

## 正しいフィードバックの了承

フィードバックが正しい場合:
```
✅ "Fixed. [Brief description of what changed]"
✅ "Good catch - [specific issue]. Fixed in [location]."
✅ [Just fix it and show in the code]

❌ "You're absolutely right!"
❌ "Great point!"
❌ "Thanks for catching that!"
❌ "Thanks for [anything]"
❌ ANY gratitude expression
```

**感謝を言わない理由:** 行動が語る。直せば十分。コード自体がフィードバックを聞いた証拠になる。

**"Thanks" を書きかけたら:** 削除する。修正内容を述べる。

## push back が誤りだったときの修正

誤って push back した場合:
```
✅ "You were right - I checked [X] and it does [Y]. Implementing now."
✅ "Verified this and you're correct. My initial understanding was wrong because [reason]. Fixing."

❌ Long apology
❌ Defending why you pushed back
❌ Over-explaining
```

事実を述べて先へ進む。

## よくある間違い

| 間違い | 修正 |
|---------|-----|
| 演技的な同意 | 要件を述べるか、黙って動く |
| 盲従 | 先にコードベースで検証 |
| テストなしの一括実装 | 1 件ずつ、それぞれテスト |
| レビュアーは正しいと仮定 | 壊れないか確認 |
| push back を避ける | 技術的正しさ > 快適さ |
| 部分実装 | 先に全項目を明確化 |
| 検証不能なのに進む | 制限を述べ、方針を質問 |

## 実例

**演技的同意（悪い例）:**
```
Reviewer: "Remove legacy code"
❌ "You're absolutely right! Let me remove that..."
```

**技術的検証（良い例）:**
```
Reviewer: "Remove legacy code"
✅ "Checking... build target is 10.15+, this API needs 13+. Need legacy for backward compat. Current impl has wrong bundle ID - fix it or drop pre-13 support?"
```

**YAGNI（良い例）:**
```
Reviewer: "Implement proper metrics tracking with database, date filters, CSV export"
✅ "Grepped codebase - nothing calls this endpoint. Remove it (YAGNI)? Or is there usage I'm missing?"
```

**不明項目（良い例）:**
```
your human partner: "Fix items 1-6"
You understand 1,2,3,6. Unclear on 4,5.
✅ "Understand 1,2,3,6. Need clarification on 4 and 5 before implementing."
```

## GitHub スレッド返信

GitHub の inline review comment に返信するときは、トップレベル PR コメントではなくコメントスレッド（`gh api repos/{owner}/{repo}/pulls/{pr}/comments/{id}/replies`）で返信する。

## 要点

**外部フィードバック = 評価すべき提案であり、従う命令ではない。**

検証する。疑問を持つ。それから実装する。

演技的な同意はしない。常に技術的厳密さを保つ。
