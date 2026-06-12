---
title: renderItem 内のインラインオブジェクトを避ける
impact: HIGH
impactDescription: メモ化リストアイテムの不要な再レンダーを防ぐ
tags: lists, performance, flatlist, virtualization, memo
---

## renderItem 内のインラインオブジェクトを避ける

props として渡す新しいオブジェクトを `renderItem` 内で作成しないでください。インラインオブジェクトはレンダーごとに新しい参照を作り、メモ化を壊します。代わりに `item` からプリミティブ値を直接渡します。

**不適切（インラインオブジェクトがメモ化を壊す）:**

```tsx
function UserList({ users }: { users: User[] }) {
  return (
    <LegendList
      data={users}
      renderItem={({ item }) => (
        <UserRow
          // Bad: new object on every render
          user={{ id: item.id, name: item.name, avatar: item.avatar }}
        />
      )}
    />
  )
}
```

**不適切（インライン style オブジェクト）:**

```tsx
renderItem={({ item }) => (
  <UserRow
    name={item.name}
    // Bad: new style object on every render
    style={{ backgroundColor: item.isActive ? 'green' : 'gray' }}
  />
)}
```

**適切（item を直接またはプリミティブを渡す）:**

```tsx
function UserList({ users }: { users: User[] }) {
  return (
    <LegendList
      data={users}
      renderItem={({ item }) => (
        // Good: pass the item directly
        <UserRow user={item} />
      )}
    />
  )
}
```

**適切（プリミティブを渡し、子で派生）:**

```tsx
renderItem={({ item }) => (
  <UserRow
    id={item.id}
    name={item.name}
    isActive={item.isActive}
  />
)}

const UserRow = memo(function UserRow({ id, name, isActive }: Props) {
  // Good: derive style inside memoized component
  const backgroundColor = isActive ? 'green' : 'gray'
  return <View style={[styles.row, { backgroundColor }]}>{/* ... */}</View>
})
```

**適切（静的スタイルをモジュールスコープに巻き上げ）:**

```tsx
const activeStyle = { backgroundColor: 'green' }
const inactiveStyle = { backgroundColor: 'gray' }

renderItem={({ item }) => (
  <UserRow
    name={item.name}
    // Good: stable references
    style={item.isActive ? activeStyle : inactiveStyle}
  />
)}
```

プリミティブまたは安定した参照を渡すことで、実際の値が変わっていない場合 `memo()` が再レンダーをスキップできます。

**注:** React Compiler が有効な場合、メモ化を自動処理するため、これらの手動最適化は重要性が下がります。
