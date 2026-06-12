---
description: Codex、Cursor、Claude などで使うエージェント自動化を診断して提案する。
---

# エージェント自動化診断

このリポジトリを読み取り専用で分析し、Codex、Cursor、Claude などの
エージェントで使うべき自動化を提案してください。

## 調査対象

- `AGENTS.md`、`CLAUDE.md`、`.apm/`、`.agents/`、`.cursor/`、`.codex/`、
  `.claude/`、`.github/instructions/`。
- 既存の skill、prompt、hook、MCP、subagent、CI、テスト、品質チェック。
- `package.json` などの manifest と、主な source tree。

## 方針

- 調査は読み取り専用にしてください。
- 大量出力を直接読み込まず、context-mode、RTK、検索、要約コマンドを優先して
  ください。
- APM 管理の内容は `.apm/` を source of truth として扱い、生成先だけの編集を
  推奨しないでください。
- 既存の仕組みで足りる場合は、新規作成ではなく既存資産の利用を提案してください。
- 推奨はカテゴリごとに 1-2 件へ絞ってください。

## 出力

次の項目を日本語で簡潔にまとめてください。

- リポジトリ概要。
- 優先して追加または使うべき自動化。
- 見送るべき提案と理由。
- 実装する場合に最初に触る source。
- 検証コマンド。
