---
title: レンダー中に派生 state を計算
impact: MEDIUM
impactDescription: 冗長なレンダーと state のずれを回避
tags: rerender, derived-state, useEffect, state
---

## レンダー中に派生 state を計算

現在の props/state から計算できる値は state に保存せず、effect で更新もしないでください。レンダー中に派生させ、余分なレンダーと state のずれを防ぎます。prop 変更への応答として effect 内で state を設定しないでください。派生値または key によるリセットを優先します。

**不適切（冗長な state と effect）:**

```tsx
function Form() {
  const [firstName, setFirstName] = useState('First')
  const [lastName, setLastName] = useState('Last')
  const [fullName, setFullName] = useState('')

  useEffect(() => {
    setFullName(firstName + ' ' + lastName)
  }, [firstName, lastName])

  return <p>{fullName}</p>
}
```

**適切（レンダー中に派生）:**

```tsx
function Form() {
  const [firstName, setFirstName] = useState('First')
  const [lastName, setLastName] = useState('Last')
  const fullName = firstName + ' ' + lastName

  return <p>{fullName}</p>
}
```

参考: [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
