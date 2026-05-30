---
title: 関数型 setState 更新を使用
impact: MEDIUM
impactDescription: stale closure と不要なコールバック再生成を防ぐ
tags: react, hooks, useState, useCallback, callbacks, closures
---

## 関数型 setState 更新を使用

現在の state 値に基づいて state を更新する場合、state 変数を直接参照せず setState の関数型更新形式を使います。stale closure を防ぎ、不要な依存関係を排除し、安定したコールバック参照を作ります。

**不適切（state を依存関係に必要）:**

```tsx
function TodoList() {
  const [items, setItems] = useState(initialItems)
  
  // Callback must depend on items, recreated on every items change
  const addItems = useCallback((newItems: Item[]) => {
    setItems([...items, ...newItems])
  }, [items])  // ❌ items dependency causes recreations
  
  // Risk of stale closure if dependency is forgotten
  const removeItem = useCallback((id: string) => {
    setItems(items.filter(item => item.id !== id))
  }, [])  // ❌ Missing items dependency - will use stale items!
  
  return <ItemsEditor items={items} onAdd={addItems} onRemove={removeItem} />
}
```

最初のコールバックは `items` が変わるたびに再生成され、子コンポーネントの不要な再レンダーを引き起こす可能性があります。2 番目のコールバックは stale closure バグがあり、常に初期 `items` 値を参照します。

**適切（安定したコールバック、stale closure なし）:**

```tsx
function TodoList() {
  const [items, setItems] = useState(initialItems)
  
  // Stable callback, never recreated
  const addItems = useCallback((newItems: Item[]) => {
    setItems(curr => [...curr, ...newItems])
  }, [])  // ✅ No dependencies needed
  
  // Always uses latest state, no stale closure risk
  const removeItem = useCallback((id: string) => {
    setItems(curr => curr.filter(item => item.id !== id))
  }, [])  // ✅ Safe and stable
  
  return <ItemsEditor items={items} onAdd={addItems} onRemove={removeItem} />
}
```

**メリット:**

1. **安定したコールバック参照** - state 変更時にコールバックを再生成不要
2. **stale closure なし** - 常に最新の state 値を使用
3. **依存関係の削減** - 依存配列を簡素化しメモリリークを低減
4. **バグ防止** - React closure バグの最も一般的な原因を排除

**関数型更新を使う場合:**

- 現在の state 値に依存する setState
- state が必要な useCallback/useMemo 内
- state を参照するイベントハンドラー
- state を更新する非同期操作

**直接更新で問題ない場合:**

- 静的値への設定: `setCount(0)`
- props/引数からのみ設定: `setName(newName)`
- 前の値に依存しない state

**注:** プロジェクトで [React Compiler](https://react.dev/learn/react-compiler) が有効な場合、コンパイラが一部を自動最適化できますが、正確性と stale closure バグ防止のため関数型更新は引き続き推奨されます。
