---
title: コールバックをリストのルートに巻き上げ
impact: MEDIUM
impactDescription: 再レンダー削減とリスト高速化
tags: tag1, tag2
---

## リストパフォーマンスのコールバック

**Impact: HIGH（再レンダー削減とリスト高速化）**

リストアイテムにコールバック関数を渡す場合、リストのルートでコールバックの単一インスタンスを作成します。アイテムは一意の識別子でそれを呼び出します。

**不適切（レンダーごとに新しいコールバックを作成）:**

```typescript
return (
  <LegendList
    renderItem={({ item }) => {
      // bad: creates a new callback on each render
      const onPress = () => handlePress(item.id)
      return <Item key={item.id} item={item} onPress={onPress} />
    }}
  />
)
```

**適切（各アイテムに単一関数インスタンスを渡す）:**

```typescript
const onPress = useCallback(() => handlePress(item.id), [handlePress, item.id])

return (
  <LegendList
    renderItem={({ item }) => (
      <Item key={item.id} item={item} onPress={onPress} />
    )}
  />
)
```

参考: [Link to documentation or resource](https://example.com)
