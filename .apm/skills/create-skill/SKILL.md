---
name: create-skill
disable-model-invocation: true
description: エージェント用 skill の新規作成・改善・検証、SKILL.md の構造確認に使います。
---

# エージェント用 skill の作成・改善

skill は特定の仕事に必要な知識・判断基準・手順を提供します。モデルが既にできる一般的な作業の説明を重ねず、プロジェクト固有の契約と失敗しやすい境界を明確にします。

## 進め方

1. **範囲を決める。** 会話と既存設定から目的、対象クライアント、保存場所、発火条件、成果物を確認します。判断できる項目は質問し直さず、結果を左右する不足情報だけ確認します。
2. **既存の原本を探す。** TABBIN では `.apm/skills/<name>/` を編集し、配布先を直接編集しません。同じ知識を持つ skill や参照資料を再利用します。
3. **検証を選ぶ。** 意味のある判断・手順変更は旧版と新版のシナリオ評価、軽微な誤字・整理・リンク修正は frontmatter・参照・同期検査を使います。詳細は [skill-authoring-tdd.md](skill-authoring-tdd.md) を参照します。
4. **入口を短く書く。** 発火条件、必要な判断、手順、完了条件を `SKILL.md` に置きます。詳細な例・チェックリスト・資料は参照ファイルに分け、必要時だけ読みます。
5. **まとめて検証・同期する。** 関連する skill はまとめて編集・検証できます。変更の検証結果を確認して `bun run apm:sync` と `bun run apm:check` を実行します。

ユーザーが正確な文言を指定した箇所はそのまま使います。既存の許可範囲内の編集について、手順上の区切りだけを理由に再承認を求めません。

## 形式と配置

```markdown
---
name: your-skill-name
description: この skill が必要になる具体的な依頼・症状。
disable-model-invocation: true
---

# Skill 名

目的、必要な判断、実行手順、完了条件。
```

- `name` は 64 文字以内の小文字英数字・ハイフン、`description` は空でない 1024 文字以内とします。
- description は短い発火条件にし、本文の手順を詰め込みません。
- 明示呼び出し用は `disable-model-invocation: true`。自動適用が必要な skill では省略します。
- `SKILL.md` は 500 行未満を上限とし、通常は短い入口に留めます。参照は入口から直接リンクします。
- TABBIN 以外で作成する場合は、対象クライアントの現在の仕様と既存配置を確認します。

品質ゲートと commit / push / PR の許可境界は、[repository-guidelines](../../../.apm/instructions/repository-guidelines.instructions.md) に従います。

## 必要時の参照

- [skill-authoring-tdd.md](skill-authoring-tdd.md): 変更に応じた評価と検証チェックリスト。
- [authoring-patterns.md](authoring-patterns.md): description、構成、例、スクリプトの書き方。
- [testing-skills-with-subagents.md](testing-skills-with-subagents.md): 独立評価が必要な場合のシナリオ設計。検証範囲は本 skill の変更別方針で決めます。
- [anthropic-best-practices.md](anthropic-best-practices.md): Claude 向けの執筆資料。対象クライアントの現在の仕様を優先します。
- [persuasion-principles.md](persuasion-principles.md): 規律違反が実際に観測された場合の補助資料。
- [graphviz-conventions.dot](graphviz-conventions.dot) / [render-graphs.js](render-graphs.js): 判断の分岐を図示する場合。
- [examples/](examples/): 執筆例。
