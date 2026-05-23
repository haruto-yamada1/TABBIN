---
description: タスクをメインセッション、Explorer、Worker、Evaluator、human grader に振り分ける。
---

# ハーネス model route

ユーザー依頼または ACTIVE run の plan を見て、どの作業をどの実行主体に渡すか判断してください。

## ルーティング

- **main session**: 次の一手が blocking、統合判断、ユーザーとの会話が必要な作業。
- **Explorer**: 読み取り専用の調査、影響範囲確認、既存設計の把握。
- **Worker**: write set が明確で、他の作業と衝突しない実装。
- **Evaluator**: 完了前の fresh-context review。
- **human grader**: UI、運用ポリシー、仕様判断などユーザー判断が必要なもの。

## 出力

担当、理由、write set、依存関係、完了条件を簡潔に提案してください。
