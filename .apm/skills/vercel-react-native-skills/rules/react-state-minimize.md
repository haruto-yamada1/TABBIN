---
title: state 変数を最小化し値を派生
impact: MEDIUM
impactDescription: 再レンダー削減、state のずれ低減
tags: state, derived-state, hooks, optimization
---

## state 変数を最小化し値を派生

可能な限り state 変数を少なくします。既存の state や props から計算できる値は state に保存せず、レンダー中に派生させます。冗長な state は不要な再レンダーを引き起こし、同期がずれる可能性があります。

**不適切（冗長な state）:**

```tsx
function Cart({ items }: { items: Item[] }) {
  const [total, setTotal] = useState(0)
  const [itemCount, setItemCount] = useState(0)

  useEffect(() => {
    setTotal(items.reduce((sum, item) => sum + item.price, 0))
    setItemCount(items.length)
  }, [items])

  return (
    <View>
      <Text>{itemCount} items</Text>
      <Text>Total: ${total}</Text>
    </View>
  )
}
```

**適切（派生値）:**

```tsx
function Cart({ items }: { items: Item[] }) {
  const total = items.reduce((sum, item) => sum + item.price, 0)
  const itemCount = items.length

  return (
    <View>
      <Text>{itemCount} items</Text>
      <Text>Total: ${total}</Text>
    </View>
  )
}
```

**別の例:**

```tsx
// Incorrect: storing both firstName, lastName, AND fullName
const [firstName, setFirstName] = useState('')
const [lastName, setLastName] = useState('')
const [fullName, setFullName] = useState('')

// Correct: derive fullName
const [firstName, setFirstName] = useState('')
const [lastName, setLastName] = useState('')
const fullName = `${firstName} ${lastName}`
```

state は最小限の source of truth であるべきです。それ以外はすべて派生します。

参考: [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure)
