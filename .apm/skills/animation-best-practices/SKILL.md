---
name: animation-best-practices
description: レスポンシブで洗練された UI の CSS / UI アニメーションパターン。hover 効果、tooltip、ボタンフィードバック、transition の実装、ちらつきやガタつきなどのアニメーション問題修正時に使います。
version: 1.0.0
---

# 実践的アニメーションのコツ

よくあるアニメーション場面の詳細リファレンス。アニメーション実装時のチェックリストとして使う。

## 記録とデバッグ

### アニメーションを記録する

違和感があるのに原因が分からないときは、アニメーションを記録してコマ送り再生する。通常速度では見えない詳細が分かる。

### ガタつくアニメーションを直す

CSS transform アニメーションの開始/終了で、GPU/CPU レンダリング切り替えにより要素が 1px ずれることがある。

**修正:**

```css
.element {
  will-change: transform;
}
```

ブラウザにアニメーション全体を GPU 上に置くよう指示する。

### 休憩を取る

アニメーションを一気に実装して ship しない。離れて、新鮮な目で戻る。良いアニメーションは数時間ではなく数日かけて見直す。

## ボタンとクリックフィードバック

### 押下時にボタンを scale する

軽い scale で即座に反応している感を出す:

```css
button:active {
  transform: scale(0.97);
}
```

UI が入力を受け取っていることが視覚的に伝わる。

### scale(0) からアニメーションしない

`scale(0)` から始めると、どこからともなく現れるように見え不自然。

**悪い例:**

```css
.element {
  transform: scale(0);
}
.element.visible {
  transform: scale(1);
}
```

**良い例:**

```css
.element {
  transform: scale(0.95);
  opacity: 0;
}
.element.visible {
  transform: scale(1);
  opacity: 1;
}
```

要素は常に何らかの形を持つ。しぼんだ風船のように。

## Tooltip と Popover

### 2 回目以降の tooltip はアニメーションを省略

最初の tooltip: delay + animation。続く tooltip（1 つ開いている間）: 即時、delay なし。

```css
.tooltip {
  transition:
    transform 125ms ease-out,
    opacity 125ms ease-out;
  transform-origin: var(--transform-origin);
}

.tooltip[data-starting-style],
.tooltip[data-ending-style] {
  opacity: 0;
  transform: scale(0.97);
}

/* Skip animation for subsequent tooltips */
.tooltip[data-instant] {
  transition-duration: 0ms;
}
```

Radix UI と Base UI は `data-instant` 属性でこのパターンをサポート。

### origin を意識したアニメーション

Popover は中心ではなく trigger から scale する。

```css
/* Default (wrong for most cases) */
.popover {
  transform-origin: center;
}

/* Correct - scale from trigger */
.popover {
  transform-origin: var(--transform-origin);
}
```

**Radix UI:**

```css
.popover {
  transform-origin: var(--radix-dropdown-menu-content-transform-origin);
}
```

**Base UI:**

```css
.popover {
  transform-origin: var(--transform-origin);
}
```

## 速度とタイミング

### アニメーションは速く

スピナーを速く回すと、読み込み時間が同じでもアプリが速く感じる。180ms の select アニメーションは 400ms より responsive に感じる。

**ルール:** UI アニメーションは 300ms 未満に保つ。

### キーボード操作はアニメーションしない

矢印キー移動、ショートカットは 1 日何百回も使う。アニメーションは遅く、切断された感じになる。

**アニメーションしないもの:**

- 矢印キーでのリスト移動
- キーボードショートカットの応答
- Tab / focus 移動

### 頻繁に使う要素には注意

hover 効果は良いが、1 日何度も発火するなら、アニメーションなしの方が良い場合もある。

**ガイドライン:** 自分のプロダクトを毎日使う。繰り返しでうるさくなるアニメーションが分かる。

## Hover 状態

### hover のちらつきを直す

hover アニメーションで要素位置が変わると、カーソルが要素外に出てちらつく。

**問題:**

```css
.box:hover {
  transform: translateY(-20%);
}
```

**解決:** 子要素をアニメーションする:

```html
<div class="box">
  <div class="box-inner"></div>
</div>
```

```css
.box:hover .box-inner {
  transform: translateY(-20%);
}

.box-inner {
  transition: transform 200ms ease;
}
```

親の hover 領域は安定し、子だけ動く。

### タッチデバイスでは hover を無効化

タッチデバイスに真の hover はない。指の accidental な動きで不要な hover が発火する。

```css
@media (hover: hover) and (pointer: fine) {
  .card:hover {
    transform: scale(1.05);
  }
}
```

**注:** Tailwind v4 の `hover:` クラスは hover をサポートするデバイスにのみ自動適用される。

## タッチとアクセシビリティ

### 適切なターゲット領域を確保

小さいボタンはタップしにくい。疑似要素で layout を変えず hit area を広げる。

**最小ターゲット:** 44px（Apple と WCAG 推奨）

```css
@utility touch-hitbox {
  position: relative;
}

@utility touch-hitbox::before {
  content: "";
  position: absolute;
  display: block;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  min-height: 44px;
  min-width: 44px;
  z-index: 9999;
}
```

Usage:

```jsx
<button className="touch-hitbox">
  <BellIcon />
</button>
```

## Easing の選び方

### enter/exit には ease-out

出入りする要素は `ease-out`。速い開始が responsive 感を作る。

```css
.dropdown {
  transition:
    transform 200ms ease-out,
    opacity 200ms ease-out;
}
```

`ease-in` は開始が遅い — UI には不向き。同じ duration でも後半に動きが集中し遅く感じる。

### 画面上の移動には ease-in-out

すでに見えている要素の移動は `ease-in-out`。車の加速/減速のような自然な動き。

```css
.slider-handle {
  transition: transform 250ms ease-in-out;
}
```

### カスタム easing カーブを使う

組み込み CSS カーブは弱いことが多い。カスタムカーブで意図的な動きに。

**リソース:**

- [easings.co](https://easings.co/)

## 視覚的トリック

### フォールバックに blur を使う

easing と timing 調整で解決しないとき、軽い blur で欠点を隠す。

```css
.button-transition {
  transition:
    transform 150ms ease-out,
    filter 150ms ease-out;
}

.button-transition:active {
  transform: scale(0.97);
  filter: blur(2px);
}
```

blur は状態間の視覚的 gap を埋め、目を滑らかな transition にだます。2 状態が別物体ではなく blend して見える。

**パフォーマンス注意:** blur は 20px 未満に。Safari では特に。

## なぜ細部が重要か

> "All those unseen details combine to produce something that's just stunning, like a thousand barely audible voices all singing in tune."
> — Paul Graham, Hackers and Painters

気づかれない細部こそが良い — ユーザーは friction なくタスクを完了する。優れた UI はアニメーションを鑑賞させるのではなく、ユーザーが目標を楽に達成できるようにする。
