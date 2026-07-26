# Skill 設計のための説得原則

## 概要

LLM は人間と同じ説得原則に反応します。この心理を理解すると、より効果的な skill を設計できます — 操作のためではなく、プレッシャー下でも重要な実践が守られるようにするためです。

**研究基盤:** Meincke et al. (2025) は N=28,000 の AI 会話で 7 つの説得原則を検証。説得技法で compliance 率は 2 倍以上（33% → 72%, p < .001）。

## 7 つの原則

### 1. Authority（権威）
**内容:** 専門性、資格、公式 source への従属。

**skill での使い方:**
- 命令形: "YOU MUST", "Never", "Always"
- 交渉不可の枠組み: "No exceptions"
- 意思決定疲れと rationalization を減らす

**使う場面:**
- 規律を強制する skill（TDD、検証要件）
- 安全クリティカルな実践
- 確立された best practice

**例:**
```markdown
✅ Write code before test? Delete it. Start over. No exceptions.
❌ Consider writing tests first when feasible.
```

### 2. Commitment（コミットメント）
**内容:** 過去の行動、発言、公開宣言との一貫性。

**skill での使い方:**
- 宣言を要求: "Announce skill usage"
- 明示的選択を強制: "Choose A, B, or C"
- 追跡: TodoWrite でチェックリスト

**使う場面:**
- skill が実際に守られることを保証
- 多段階プロセス
- アカウンタビリティ機構

**例:**
```markdown
✅ When you find a skill, you MUST announce: "I'm using [Skill Name]"
❌ Consider letting your partner know which skill you're using.
```

### 3. Scarcity（希少性）
**内容:** 時間制限や限定 availability からの緊急性。

**skill での使い方:**
- 時間境界要件: "Before proceeding"
- 順次依存: "Immediately after X"
- 「後でやる」の防止

**使う場面:**
- 即時検証要件
- 時間敏感な workflow
- 「後でやる」防止

**例:**
```markdown
✅ After completing a task, IMMEDIATELY request code review before proceeding.
❌ You can review code when convenient.
```

### 4. Social Proof（社会的証明）
**内容:** 他者の行動や「普通」とされるものへの同調。

**skill での使い方:**
- 普遍パターン: "Every time", "Always"
- 失敗モード: "X without Y = failure"
- 規範の確立

**使う場面:**
- 普遍的実践の文書化
- よくある失敗の警告
- 標準の強化

**例:**
```markdown
✅ Checklists without TodoWrite tracking = steps get skipped. Every time.
❌ Some people find TodoWrite helpful for checklists.
```

### 5. Unity（一体感）
**内容:** 共有アイデンティティ、「we-ness」、内集団所属。

**skill での使い方:**
- 協調的言語: "our codebase", "we're colleagues"
- 共有目標: "we both want quality"

**使う場面:**
- 協調 workflow
- チーム文化の確立
- 非階層的実践

**例:**
```markdown
✅ We're colleagues working together. I need your honest technical judgment.
❌ You should probably tell me if I'm wrong.
```

### 6. Reciprocity（返報性）
**内容:** 受けた利益を返す義務。

**使い方:**
- 控えめに — 操作的に感じることがある
- skill ではほぼ不要

**避ける場面:**
- ほぼ常に（他の原則の方が効果的）

### 7. Liking（好意）
**内容:** 好きな相手と協力したい偏好。

**使い方:**
- **compliance には使わない**
- 正直なフィードバック文化と矛盾
- へつらいを生む

**避ける場面:**
- 規律強制では常に

## skill タイプ別の原則の組み合わせ

| Skill タイプ | 使う | 避ける |
|------------|-----|-------|
| 規律強制 | Authority + Commitment + Social Proof | Liking, Reciprocity |
| ガイダンス/技法 | 適度な Authority + Unity | 強い authority |
| 協調型 | Unity + Commitment | Authority, Liking |
| リファレンス | 明確さのみ | 説得全般 |

## なぜ効くか: 心理学

**明確なルールは rationalization を減らす:**
- "YOU MUST" は意思決定疲れを減らす
- 絶対表現は「例外か？」の問いを消す
- 明示的 anti-rationalization counter が loophole を塞ぐ

**implementation intention は自動行動を作る:**
- 明確な trigger + 必須 action = 自動実行
- "When X, do Y" は "generally do Y" より効果的
- compliance の認知負荷を減らす

**LLM は parahuman:**
- これらのパターンを含む human text で訓練
- Authority 言語の後に compliance が続く
- Commitment 系列（宣言 → 行動）が頻繁にモデル化
- Social proof（みんな X する）が規範を確立

## 倫理的使用

**正当:**
- 重要な実践が守られることの保証
- 効果的なドキュメント作成
- 予測可能な失敗の防止

**不当:**
- 個人利益のための操作
- 虚偽の緊急性
- 罪悪感ベースの compliance

**テスト:** ユーザーが完全に理解した上で、この技法は本人の genuine な利益に役立つか？

## 研究引用

**Cialdini, R. B. (2021).** *Influence: The Psychology of Persuasion (New and Expanded).* Harper Business.
- 7 つの説得原則
- 影響力研究の実証基盤

**Meincke, L., Shapiro, D., Duckworth, A. L., Mollick, E., Mollick, L., & Cialdini, R. (2025).** Call Me A Jerk: Persuading AI to Comply with Objectionable Requests. University of Pennsylvania.
- N=28,000 LLM 会話で 7 原則を検証
- 説得技法で compliance 33% → 72%
- Authority、commitment、scarcity が最も効果的
- LLM 行動の parahuman モデルを検証

## クイックリファレンス

skill を設計するとき:

1. **タイプは？**（規律 vs ガイダンス vs リファレンス）
2. **変えたい行動は？**
3. **どの原則が当てはまる？**（規律では通常 authority + commitment）
4. **組み合わせすぎていない？**（7 つ全部は使わない）
5. **倫理的か？**（ユーザーの genuine な利益に役立つか？）
