---
name: vercel-composition-patterns
description: スケールする React コンポジションパターン。boolean props の増殖があるコンポーネントのリファクタリング、柔軟なコンポーネントライブラリの構築、再利用可能な API の設計に使用します。複合コンポーネント、render props、context プロバイダー、コンポーネントアーキテクチャに関するタスクで使用されます。React 19 の API 変更も含みます。
license: MIT
metadata:
  author: vercel
  version: '1.0.0'
---

# React コンポジションパターン

柔軟でメンテナンス可能なReactコンポーネントを構築するためのコンポジションパターン。
複合コンポーネント、状態のリフトアップ、内部のコンポジションを使用することで、
boolean propsの増殖を避けます。これらのパターンは、スケールする際に人間とAI
エージェントの両方にとってコードベースを扱いやすくします。

## 適用タイミング

以下の場合にこのガイドラインを参照してください：

- 多数のboolean propsを持つコンポーネントのリファクタリング
- 再利用可能なコンポーネントライブラリの構築
- 柔軟なコンポーネントAPIの設計
- コンポーネントアーキテクチャのレビュー
- 複合コンポーネントやcontextプロバイダーの作業

## ルールカテゴリ（優先度順）

| 優先度 | カテゴリ                | 影響度 | プレフィックス    |
| ------ | ----------------------- | ------ | --------------- |
| 1      | コンポーネント設計      | HIGH   | `architecture-` |
| 2      | 状態管理                | MEDIUM | `state-`        |
| 3      | 実装パターン            | MEDIUM | `patterns-`     |
| 4      | React 19 APIs           | MEDIUM | `react19-`      |

## クイックリファレンス

### 1. コンポーネント設計 (HIGH)

- `architecture-avoid-boolean-props` - 動作をカスタマイズするためにboolean propsを
  追加しない。コンポジションを使用する
- `architecture-compound-components` - 共有コンテキストを使って複雑なコンポーネントを
  構造化する

### 2. 状態管理 (MEDIUM)

- `state-decouple-implementation` - プロバイダーは状態管理方法を知る唯一の場所
- `state-context-interface` - 依存性注入のためにstate、actions、metaを持つ
  汎用インターフェースを定義する
- `state-lift-state` - 兄弟コンポーネントからのアクセスのため、状態をプロバイダー
  コンポーネントに移動する

### 3. 実装パターン (MEDIUM)

- `patterns-explicit-variants` - booleanモードの代わりに明示的なバリアント
  コンポーネントを作成する
- `patterns-children-over-render-props` - renderX propsの代わりにchildrenを
  コンポジションに使用する

### 4. React 19 APIs (MEDIUM)

> **⚠️ React 19以降のみ。** React 18以前を使用している場合はこのセクションをスキップしてください。

- `react19-no-forwardref` - `forwardRef`を使用しない。`useContext()`の代わりに`use()`を使用する

## 使い方

詳細な説明とコード例については、個々のルールファイルを読んでください：

```
rules/architecture-avoid-boolean-props.md
rules/state-context-interface.md
```

各ルールファイルには以下が含まれます：

- なぜ重要かの簡単な説明
- 説明付きの不適切なコード例
- 説明付きの適切なコード例
- 追加のコンテキストと参照

## 完全版ドキュメント

すべてのルールが展開された完全なガイドについては、`AGENTS.md` を参照してください。
