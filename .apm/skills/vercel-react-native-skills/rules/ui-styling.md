---
title: モダン React Native スタイリングパターン
impact: MEDIUM
impactDescription: 一貫したデザイン、滑らかな境界、クリーンなレイアウト
tags: styling, css, layout, shadows, gradients
---

## モダン React Native スタイリングパターン

よりクリーンで一貫した React Native コードのため、次のスタイリングパターンに従ってください。

**`borderRadius` には常に `borderCurve: 'continuous'` を使用:**

```tsx
// 不適切
{ borderRadius: 12 }

// 適切 – より滑らかな iOS 風の角
{ borderRadius: 12, borderCurve: 'continuous' }
```

**要素間のスペーシングには margin ではなく `gap` を使用:**

```tsx
// 不適切 – 子要素に margin
<View>
  <Text style={{ marginBottom: 8 }}>Title</Text>
  <Text style={{ marginBottom: 8 }}>Subtitle</Text>
</View>

// 適切 – 親に gap
<View style={{ gap: 8 }}>
  <Text>Title</Text>
  <Text>Subtitle</Text>
</View>
```

**内側のスペースには `padding`、要素間には `gap`:**

```tsx
<View style={{ padding: 16, gap: 12 }}>
  <Text>First</Text>
  <Text>Second</Text>
</View>
```

**線形グラデーションには `experimental_backgroundImage` を使用:**

```tsx
// 不適切 – サードパーティグラデーションライブラリ
<LinearGradient colors={['#000', '#fff']} />

// 適切 – ネイティブ CSS グラデーション構文
<View
  style={{
    experimental_backgroundImage: 'linear-gradient(to bottom, #000, #fff)',
  }}
/>
```

**シャドウには CSS `boxShadow` 文字列構文:**

```tsx
// 不適切 – レガシーシャドウオブジェクトまたは elevation
{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1 }
{ elevation: 4 }

// 適切 – CSS box-shadow 構文
{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }
```

**複数のフォントサイズを避け — 強調には weight と color を使用:**

```tsx
// 不適切 – 階層のためフォントサイズを変える
<Text style={{ fontSize: 18 }}>Title</Text>
<Text style={{ fontSize: 14 }}>Subtitle</Text>
<Text style={{ fontSize: 12 }}>Caption</Text>

// 適切 – サイズは統一、weight と color で階層
<Text style={{ fontWeight: '600' }}>Title</Text>
<Text style={{ color: '#666' }}>Subtitle</Text>
<Text style={{ color: '#999' }}>Caption</Text>
```

フォントサイズを制限すると視覚的一貫性が得られます。階層には `fontWeight`（bold/semibold）とグレースケール色を使います。
