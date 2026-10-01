---
name: subagent-driven-development
description: 現在のセッションで独立したタスクを含む実装計画を実行するときに使います。
---

# サブエージェント駆動開発

計画の独立した作業を分担する。直ちに結果が必要な作業や小変更は main で進める。
レビュー構成は変更のリスクレベルに応じて切り替える。

**核心原則:** 担当範囲を分離した委任と、リスクに応じたレビュー。

## 発火条件

- 実装計画があり、タスクが概ね独立している
- 同一セッションで実行したい
- タスクが密結合の場合は直接実行または executing-plans を使う

## リスク別レビュー構成

変更のリスクレベルに応じてレビュー構成を切り替える。リスクは影響範囲（user data、
permission、public behavior、security に関わるか）と変更規模で判断する。

| リスク   | 構成                                                    | 適用基準                                          |
| -------- | ------------------------------------------------------- | ------------------------------------------------- |
| low      | main 実装 + deterministic gate                          | ロジック修正、単一ファイル、テスト可能            |
| medium   | implementer + reviewer 1名                              | 複数ファイル、UI 変更、新規機能                   |
| high     | implementer + spec reviewer + quality/security reviewer | storage、permission、public API、セキュリティ境界 |
| critical | Harness + fresh-context evaluator + human judgment      | アーキテクチャ変更、データ移行、仕様判断が必要    |

小規模な変更で二段階レビューと最終レビューを必須にしない。リスクに見合った検証を選ぶ。

## プロセス

1. 計画を読み、全タスクを抽出し、コンテキストを整理する
2. 各タスクのリスクレベルを判定する
3. タスクごとに:
   a. 分担する場合は implementer に目的、担当ファイル、制約、完了条件、必要な参照先を渡す
   b. 質問には答え、回答に依存しない作業は続ける
   c. 実装、必要な検証、セルフレビューを行う。commit は許可され、統合担当と調整済みの場合だけ行う
   d. リスクレベルに応じたレビューを実施する
   e. レビューで issue が見つかったら implementer が修正し再レビューする
   f. タスクを完了とする
4. 全タスク完了後、high / critical リスクの場合は全体の最終レビューを行う

## プロンプトテンプレート

- `./implementer-prompt.md` - 実装者サブエージェントの dispatch
- `./spec-reviewer-prompt.md` - spec 準拠レビュアー（high / critical で使用）
- `./code-quality-reviewer-prompt.md` - コード品質レビュアー（medium 以上で使用）

## レッドフラグ

- ユーザーの明示的同意なしに main / master で実装を開始しない
- リスクレベルに見合わないレビューを省略しない
- 未修正の issue に依存する作業は進めない。独立した担当作業は続けてよい
- 担当ファイルや共有状態が衝突する実装は並列化しない。分離できる作業は並列に進める
- plan 全文や会話履歴を一律に転送しない。該当部分と参照先を渡し、必要なら原本を読めるようにする
- サブエージェントの質問を無視しない。未回答事項に依存する作業だけを待つ
- implementer のセルフレビューで実レビューを置き換えない（リスクレベルが medium 以上なら両方必要）

## 連携

- **using-git-worktrees** - 開始前に隔離 workspace を用意
- **writing-plans** - この skill が実行する plan を作成
- **test-driven-development** - 各タスクで TDD に従う
- **finishing-a-development-branch** - 全タスク完了後の開発完了
- **executing-plans** - 並列セッションで実行するときの代替
