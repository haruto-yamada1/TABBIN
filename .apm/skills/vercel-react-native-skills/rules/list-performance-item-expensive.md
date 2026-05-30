---
title: リストアイテムを軽量に保つ
impact: HIGH
impactDescription: スクロール中の表示アイテムのレンダー時間を削減
tags: lists, performance, virtualization, hooks
---

## リストアイテムを軽量に保つ

リストアイテムは可能な限りレンダーコストを低くすべきです。フックを最小化し、クエリを避け、React Context アクセスを制限します。仮想化リストはスクロール中に多くのアイテムをレンダリングするため、高コストなアイテムはカクつきの原因になります。

**不適切（重いリストアイテム）:**

```tsx
function ProductRow({ id }: { id: string }) {
  // Bad: query inside list item
  const { data: product } = useQuery(['product', id], () => fetchProduct(id))
  // Bad: multiple context accesses
  const theme = useContext(ThemeContext)
  const user = useContext(UserContext)
  const cart = useContext(CartContext)
  // Bad: expensive computation
  const recommendations = useMemo(
    () => computeRecommendations(product),
    [product]
  )

  return <View>{/* ... */}</View>
}
```

**適切（軽量リストアイテム）:**

```tsx
function ProductRow({ name, price, imageUrl }: Props) {
  // Good: receives only primitives, minimal hooks
  return (
    <View>
      <Image source={{ uri: imageUrl }} />
      <Text>{name}</Text>
      <Text>{price}</Text>
    </View>
  )
}
```

**データフェッチを親に移動:**

```tsx
// Parent fetches all data once
function ProductList() {
  const { data: products } = useQuery(['products'], fetchProducts)

  return (
    <LegendList
      data={products}
      renderItem={({ item }) => (
        <ProductRow name={item.name} price={item.price} imageUrl={item.image} />
      )}
    />
  )
}
```

**共有値には Context の代わりに Zustand セレクター:**

```tsx
// Incorrect: Context causes re-render when any cart value changes
function ProductRow({ id, name }: Props) {
  const { items } = useContext(CartContext)
  const inCart = items.includes(id)
  // ...
}

// Correct: Zustand selector only re-renders when this specific value changes
function ProductRow({ id, name }: Props) {
  // use Set.has (created once at the root) instead of Array.includes()
  const inCart = useCartStore((s) => s.items.has(id))
  // ...
}
```

**リストアイテムのガイドライン:**

- クエリやデータフェッチなし
- 高コストな計算なし（親へ移動または親レベルでメモ化）
- React Context より Zustand セレクターを優先
- useState/useEffect フックを最小化
- 事前計算された値を props として渡す

目標: リストアイテムは props を受け取り JSX を返す単純なレンダリング関数であること。
