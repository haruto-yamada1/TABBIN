---
title: リストで圧縮画像を使用
impact: HIGH
impactDescription: 読み込み高速化、メモリ削減
tags: lists, images, performance, optimization
---

## リストで圧縮画像を使用

リストでは常に圧縮され適切なサイズの画像を読み込みます。フル解像度画像は過剰なメモリを消費し、スクロールのカクつきを引き起こします。サーバーからサムネイルを取得するか、リサイズパラメータ付きの画像 CDN を使用します。

**不適切（フル解像度画像）:**

```tsx
function ProductItem({ product }: { product: Product }) {
  return (
    <View>
      {/* 4000x3000 image loaded for a 100x100 thumbnail */}
      <Image
        source={{ uri: product.imageUrl }}
        style={{ width: 100, height: 100 }}
      />
      <Text>{product.name}</Text>
    </View>
  )
}
```

**適切（適切なサイズの画像をリクエスト）:**

```tsx
function ProductItem({ product }: { product: Product }) {
  // Request a 200x200 image (2x for retina)
  const thumbnailUrl = `${product.imageUrl}?w=200&h=200&fit=cover`

  return (
    <View>
      <Image
        source={{ uri: thumbnailUrl }}
        style={{ width: 100, height: 100 }}
        contentFit='cover'
      />
      <Text>{product.name}</Text>
    </View>
  )
}
```

組み込みキャッシュとプレースホルダー対応の最適化画像コンポーネント（`expo-image` や `SolitoImage`（内部で `expo-image` を使用）など）を使用します。Retina 画面向けに表示サイズの 2 倍の画像をリクエストしてください。
