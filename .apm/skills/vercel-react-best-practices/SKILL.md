---
name: vercel-react-best-practices
description: Vercel エンジニアリング由来の React パフォーマンス最適化ガイドライン。React コードの記述、レビュー、リファクタリング時に最適なパフォーマンスパターンを確保するために使用します。React コンポーネント、クライアント側データフェッチ、バンドル最適化、パフォーマンス改善に関するタスクで使用されます。Next.js / RSC / SSR 固有のルールは除外済み（WXT ブラウザ拡張向けに React 共通部分のみ残存）。
license: MIT
metadata:
  author: vercel
  version: "1.0.0"
---

# Vercel React ベストプラクティス

Vercel が管理する React アプリケーションのパフォーマンス最適化ガイドから、クライアントサイド React に適用できる部分を抜き出したガイド。自動リファクタリングとコード生成を導くため、影響度別に優先順位付けされた 7 カテゴリ 47 ルールを含みます。元は React + Next.js 向け 57 ルールでしたが、Next.js / RSC / SSR 固有のルール（server-*・API ルート・ハイドレーション系）は TABBIN の WXT ブラウザ拡張で該当しないため除外しています。

## いつ適用するか

以下の場合にこのガイドラインを参照してください：
- 新しい React コンポーネントを記述する時
- クライアント側データフェッチを実装する時
- パフォーマンス問題のコードレビュー時
- 既存の React コードをリファクタリングする時
- バンドルサイズや読み込み時間を最適化する時

## 優先度別ルールカテゴリ

| 優先度 | カテゴリ | 影響度 | プレフィックス |
|--------|----------|--------|---------------|
| 1 | ウォーターフォールの排除 | CRITICAL | `async-` |
| 2 | バンドルサイズの最適化 | CRITICAL | `bundle-` |
| 3 | クライアントサイドデータフェッチ | MEDIUM-HIGH | `client-` |
| 4 | 再レンダリングの最適化 | MEDIUM | `rerender-` |
| 5 | レンダリングパフォーマンス | MEDIUM | `rendering-` |
| 6 | JavaScript パフォーマンス | LOW-MEDIUM | `js-` |
| 7 | 高度なパターン | LOW | `advanced-` |

## クイックリファレンス

### 1. ウォーターフォールの排除 (CRITICAL)

- `async-defer-await` - await を実際に使用する分岐に移動
- `async-parallel` - 独立した操作には Promise.all() を使用
- `async-dependencies` - 部分的な依存関係には better-all を使用
- `async-suspense-boundaries` - データ待ちを局所化するために Suspense を使用

### 2. バンドルサイズの最適化 (CRITICAL)

- `bundle-barrel-imports` - 直接インポートし、バレルファイルを回避
- `bundle-dynamic-imports` - 重いコンポーネントには React.lazy / Suspense を使用
- `bundle-defer-third-party` - アナリティクス/ログは遅延読み込み
- `bundle-conditional` - 機能が有効化された時のみモジュールを読み込み
- `bundle-preload` - ホバー/フォーカス時にプリロードして体感速度を向上

### 3. クライアントサイドデータフェッチ (MEDIUM-HIGH)

- `client-swr-dedup` - 自動リクエスト重複排除に SWR を使用
- `client-event-listeners` - グローバルイベントリスナーの重複排除
- `client-passive-event-listeners` - スクロールにはパッシブリスナーを使用
- `client-localstorage-schema` - localStorage データのバージョン管理と最小化

### 4. 再レンダリングの最適化 (MEDIUM)

- `rerender-defer-reads` - コールバックでのみ使用する state は購読しない
- `rerender-memo` - コストの高い処理はメモ化コンポーネントに抽出
- `rerender-memo-with-default-value` - デフォルトの非プリミティブ props を巻き上げ
- `rerender-dependencies` - エフェクトではプリミティブな依存関係を使用
- `rerender-derived-state` - 生の値ではなく派生した boolean を購読
- `rerender-derived-state-no-effect` - エフェクトではなくレンダー中に state を派生
- `rerender-functional-setstate` - 安定したコールバックのために関数型 setState を使用
- `rerender-lazy-state-init` - コストの高い値には useState に関数を渡す
- `rerender-simple-expression-in-memo` - シンプルなプリミティブには memo を避ける
- `rerender-move-effect-to-event` - インタラクションロジックはイベントハンドラに配置
- `rerender-transitions` - 緊急でない更新には startTransition を使用
- `rerender-use-ref-transient-values` - 一時的で頻繁な値には refs を使用

### 5. レンダリングパフォーマンス (MEDIUM)

- `rendering-animate-svg-wrapper` - SVG 要素ではなく div ラッパーをアニメーション
- `rendering-content-visibility` - 長いリストには content-visibility を使用
- `rendering-hoist-jsx` - 静的 JSX をコンポーネント外に抽出
- `rendering-svg-precision` - SVG 座標の精度を削減
- `rendering-activity` - 表示/非表示には Activity コンポーネントを使用
- `rendering-conditional-render` - && ではなく三項演算子を使用
- `rendering-usetransition-loading` - ローディング状態には useTransition を優先

### 6. JavaScript パフォーマンス (LOW-MEDIUM)

- `js-batch-dom-css` - クラスや cssText で CSS 変更をグループ化
- `js-index-maps` - 繰り返しルックアップには Map を構築
- `js-cache-property-access` - ループ内でオブジェクトプロパティをキャッシュ
- `js-cache-function-results` - モジュールレベル Map で関数結果をキャッシュ
- `js-cache-storage` - localStorage/sessionStorage の読み取りをキャッシュ
- `js-combine-iterations` - 複数の filter/map を 1 つのループに統合
- `js-length-check-first` - コストの高い比較の前に配列長をチェック
- `js-early-exit` - 関数から早期リターン
- `js-hoist-regexp` - RegExp 作成をループ外に巻き上げ
- `js-min-max-loop` - sort ではなくループで min/max を使用
- `js-set-map-lookups` - O(1) ルックアップに Set/Map を使用
- `js-tosorted-immutable` - イミュータビリティには toSorted() を使用

### 7. 高度なパターン (LOW)

- `advanced-event-handler-refs` - イベントハンドラを refs に保存
- `advanced-init-once` - アプリロードごとに 1 回だけ初期化
- `advanced-use-latest` - 安定したコールバック refs のために useLatest を使用

## 使い方

詳細な説明とコード例については、個別のルールファイルを参照してください：

```
rules/async-parallel.md
rules/bundle-barrel-imports.md
```

各ルールファイルには以下が含まれます：
- なぜ重要かの簡潔な説明
- 説明付きの間違ったコード例
- 説明付きの正しいコード例
- 追加のコンテキストと参照
