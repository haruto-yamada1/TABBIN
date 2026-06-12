---
title: 現在値に依存する state には dispatch updater を使用
impact: MEDIUM
impactDescription: stale closure を回避、不要な再レンダーを防ぐ
tags: state, hooks, useState, callbacks
---

## 現在値に依存する state には dispatch updater を使用

次の state が現在の state に依存する場合、コールバック内で state 変数を直接読む代わりに dispatch updater（`setState(prev => ...)`）を使用します。stale closure を避け、最新値と比較できます。

**不適切（state を直接読み取り）:**

```tsx
const [size, setSize] = useState<Size | undefined>(undefined)

const onLayout = (e: LayoutChangeEvent) => {
  const { width, height } = e.nativeEvent.layout
  // size may be stale in this closure
  if (size?.width !== width || size?.height !== height) {
    setSize({ width, height })
  }
}
```

**適切（dispatch updater）:**

```tsx
const [size, setSize] = useState<Size | undefined>(undefined)

const onLayout = (e: LayoutChangeEvent) => {
  const { width, height } = e.nativeEvent.layout
  setSize((prev) => {
    if (prev?.width === width && prev?.height === height) return prev
    return { width, height }
  })
}
```

updater から前の値を返すと再レンダーをスキップします。

プリミティブ state では、再レンダー前の値比較は不要です。

**不適切（プリミティブ state の不要な比較）:**

```tsx
const [size, setSize] = useState<Size | undefined>(undefined)

const onLayout = (e: LayoutChangeEvent) => {
  const { width, height } = e.nativeEvent.layout
  setSize((prev) => (prev === width ? prev : width))
}
```

**適切（プリミティブ state を直接設定）:**

```tsx
const [size, setSize] = useState<Size | undefined>(undefined)

const onLayout = (e: LayoutChangeEvent) => {
  const { width, height } = e.nativeEvent.layout
  setSize(width)
}
```

ただし次の state が現在の state に依存する場合は、引き続き dispatch updater を使います。

**不適切（コールバックから state を直接読み取り）:**

```tsx
const [count, setCount] = useState(0)

const onTap = () => {
  setCount(count + 1)
}
```

**適切（dispatch updater）:**

```tsx
const [count, setCount] = useState(0)

const onTap = () => {
  setCount((prev) => prev + 1)
}
```
