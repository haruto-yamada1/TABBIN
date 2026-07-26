# skill 執筆の TDD 詳細（旧 writing-skills 統合）

この文書は `create-skill` SKILL.md から分割した skill 執筆の TDD 詳細です。SKILL.md には要約とこの file への link だけを置き、500 行制限を守ります。

## skill 執筆の TDD

**Skill の執筆は、プロセス文書への TDD 適用そのものです。** test case（subagent 付き pressure scenario）を書き、失敗を観察（baseline 行動）、skill（文書）を書き、pass を観察（compliance）、refactor（loophole を塞ぐ）。skill なしで agent が失敗するのを見ていなければ、skill が正しいことを教えているか分かりません。

### RED-GREEN-REFACTOR

| TDD 概念 | skill 執筆 |
| --- | --- |
| Test case | subagent 付き pressure scenario |
| Production code | skill 文書（SKILL.md） |
| RED（test fail） | skill なしで agent がルール違反（baseline） |
| GREEN（test pass） | skill ありで compliance |
| REFACTOR | compliance を維持しつつ loophole を塞ぐ |

1. **RED**: skill なしで pressure scenario を実行し、agent の選択・rationalization・違反を誘発した pressure を verbatim 記録する。
2. **GREEN**: その rationalization に対処する最小の skill を書く。仮説ケースの余計な内容は足さない。同じ scenario を skill ありで compliance を検証する。
3. **REFACTOR**: 新たな rationalization が出たら明示的な counter を追加し、bulletproof まで再テストする。

規律 skill（何かを「してはいけない」系）では 3+ の複合 pressure（time / sunk cost / authority / exhaustion）を使う。

### 圧縮された執筆チェックリスト

**RED:**
- [ ] pressure scenario 作成（規律 skill は 3+ 複合 pressure）
- [ ] skill なしで baseline を verbatim 記録
- [ ] rationalization / 失敗パターン特定

**GREEN:**
- [ ] 名前は英字・数字・ハイフンのみ
- [ ] frontmatter は name と description（max 1024 chars）
- [ ] description は "Use when..." 開始、具体 trigger / symptom、三人称、検索 keyword 含む
- [ ] 核心原則付き clear overview
- [ ] RED の baseline 失敗に対処
- [ ] 優れた 1 例（多言語不可）
- [ ] skill ありで compliance 検証

**REFACTOR:**
- [ ] testing から新 rationalization 特定、明示 counter 追加
- [ ] rationalization table / red flags list 作成
- [ ] bulletproof まで再テスト

### アンチパターン

- ナラティブ例（"In session 2025-... we found..."）— 特定すぎて再利用不可。
- 多言語 dilution（example-js.js / example-py.py / example-go.go）— 保守負担だけ増える。
- Flowchart 内にコード（copy-paste 不可、読みにくい）。
- 汎用 label（helper1 / step3 / pattern4）— label は意味を持つべき。
- 未テスト skill の batch deploy — 未テスト code の deploy と同じ。

### STOP: 次 skill へ進む前

skill を書いたら STOP し、deploy checklist を完了してから次へ。各 skill で RED→GREEN→REFACTOR を必須とし、"batch の方が効率" で test を skip しない。

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

---
