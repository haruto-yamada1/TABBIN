---
title: メモ化のためリストアイテムにプリミティブを渡す
impact: HIGH
impactDescription: 効果的な memo() 比較を可能にする
tags: lists, performance, memo, primitives
---

## メモ化のためリストアイテムにプリミティブを渡す

可能な限り、リストアイテムコンポーネントにはプリミティブ値（文字列、数値、boolean）だけを props として渡します。プリミティブにより `memo()` の浅い比較が正しく機能し、値が変わっていない場合の再レンダーをスキップできます。

**不適切（オブジェクト prop は深い比較が必要）:**

```tsx
type User = { id: string; name: string; email: string; avatar: string }

const UserRow = memo(function UserRow({ user }: { user: User }) {
  // memo() compares user by reference, not value
  // If parent creates new user object, this re-renders even if data is same
  return <Text>{user.name}</Text>
})

renderItem={({ item }) => <UserRow user={item} />}
```

最適化は可能ですが、適切にメモ化するのはより難しくなります。

**適切（プリミティブ props で浅い比較を可能に）:**

```tsx
const UserRow = memo(function UserRow({
  id,
  name,
  email,
}: {
  id: string
  name: string
  email: string
}) {
  // memo() compares each primitive directly
  // Re-renders only if id, name, or email actually changed
  return <Text>{name}</Text>
})

renderItem={({ item }) => (
  <UserRow id={item.id} name={item.name} email={item.email} />
)}
```

**必要なものだけ渡す:**

```tsx
// Incorrect: passing entire item when you only need name
<UserRow user={item} />

// Correct: pass only the fields the component uses
<UserRow name={item.name} avatarUrl={item.avatar} />
```

**コールバックは巻き上げるか item ID を使用:**

```tsx
// Incorrect: inline function creates new reference
<UserRow name={item.name} onPress={() => handlePress(item.id)} />

// Correct: pass ID, handle in child
<UserRow id={item.id} name={item.name} />

const UserRow = memo(function UserRow({ id, name }: Props) {
  const handlePress = useCallback(() => {
    // use id here
  }, [id])
  return <Pressable onPress={handlePress}><Text>{name}</Text></Pressable>
})
```

プリミティブ props によりメモ化が予測可能で効果的になります。

**注:** React Compiler が有効な場合、`memo()` や `useCallback()` は不要ですが、オブジェクト参照の考慮は引き続き適用されます。
