---
title: レンダー早期に関数を分割代入（React Compiler）
impact: HIGH
impactDescription: 安定した参照、再レンダー削減
tags: rerender, hooks, performance, react-compiler
---

## レンダー早期に関数を分割代入

このルールは React Compiler を使用している場合のみ適用されます。

フックから関数をレンダースコープの先頭で分割代入します。オブジェクトにドットして関数を呼ばないでください。分割代入した関数は安定した参照です。ドットアクセスは新しい参照を作りメモ化を壊します。

**不適切（オブジェクトにドット）:**

```tsx
import { useRouter } from 'expo-router'

function SaveButton(props) {
  const router = useRouter()

  // bad: react-compiler will key the cache on "props" and "router", which are objects that change each render
  const handlePress = () => {
    props.onSave()
    router.push('/success') // unstable reference
  }

  return <Button onPress={handlePress}>Save</Button>
}
```

**適切（早期分割代入）:**

```tsx
import { useRouter } from 'expo-router'

function SaveButton({ onSave }) {
  const { push } = useRouter()

  // good: react-compiler will key on push and onSave
  const handlePress = () => {
    onSave()
    push('/success') // stable reference
  }

  return <Button onPress={handlePress}>Save</Button>
}
```
