---
title: 異種リストに item 型を使用
impact: HIGH
impactDescription: 効率的なリサイクル、レイアウトスラッシング低減
tags: list, performance, recycling, heterogeneous, LegendList
---

## 異種リストに item 型を使用

リストに異なるアイテムレイアウト（メッセージ、画像、ヘッダーなど）がある場合、各アイテムに `type` フィールドを設け、リストに `getItemType` を提供します。これによりアイテムが別々のリサイクルプールに入り、メッセージコンポーネントが画像コンポーネントにリサイクルされることがなくなります。

**不適切（条件分岐の単一コンポーネント）:**

```tsx
type Item = { id: string; text?: string; imageUrl?: string; isHeader?: boolean }

function ListItem({ item }: { item: Item }) {
  if (item.isHeader) {
    return <HeaderItem title={item.text} />
  }
  if (item.imageUrl) {
    return <ImageItem url={item.imageUrl} />
  }
  return <MessageItem text={item.text} />
}

function Feed({ items }: { items: Item[] }) {
  return (
    <LegendList
      data={items}
      renderItem={({ item }) => <ListItem item={item} />}
      recycleItems
    />
  )
}
```

**適切（型付きアイテムと別コンポーネント）:**

```tsx
type HeaderItem = { id: string; type: 'header'; title: string }
type MessageItem = { id: string; type: 'message'; text: string }
type ImageItem = { id: string; type: 'image'; url: string }
type FeedItem = HeaderItem | MessageItem | ImageItem

function Feed({ items }: { items: FeedItem[] }) {
  return (
    <LegendList
      data={items}
      keyExtractor={(item) => item.id}
      getItemType={(item) => item.type}
      renderItem={({ item }) => {
        switch (item.type) {
          case 'header':
            return <SectionHeader title={item.title} />
          case 'message':
            return <MessageRow text={item.text} />
          case 'image':
            return <ImageRow url={item.url} />
        }
      }}
      recycleItems
    />
  )
}
```

**重要な理由:**

- **リサイクル効率**: 同じ型のアイテムがリサイクルプールを共有
- **レイアウトスラッシングなし**: ヘッダーが画像セルにリサイクルされない
- **型安全性**: TypeScript が各分岐で item 型を絞り込める
- **より良いサイズ推定**: 型ごとに正確な推定のため `getEstimatedItemSize` と `itemType` を使用

```tsx
<LegendList
  data={items}
  keyExtractor={(item) => item.id}
  getItemType={(item) => item.type}
  getEstimatedItemSize={(index, item, itemType) => {
    switch (itemType) {
      case 'header':
        return 48
      case 'message':
        return 72
      case 'image':
        return 300
      default:
        return 72
    }
  }}
  renderItem={({ item }) => {
    /* ... */
  }}
  recycleItems
/>
```

参考:
[LegendList getItemType](https://legendapp.com/open-source/list/api/props/#getitemtype-v2)
