---
title: 手動ローディング state より useTransition を使用
impact: LOW
impactDescription: 再レンダーを削減しコードの明確性を向上
tags: rendering, transitions, useTransition, loading, state
---

## 手動ローディング state より useTransition を使用

ローディング state には手動 `useState` ではなく `useTransition` を使用します。組み込みの `isPending` state を提供し、transition を自動管理します。

**不適切（手動ローディング state）:**

```tsx
function SearchResults() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  const handleSearch = async (value: string) => {
    setIsLoading(true)
    setQuery(value)
    const data = await fetchResults(value)
    setResults(data)
    setIsLoading(false)
  }

  return (
    <>
      <input onChange={(e) => handleSearch(e.target.value)} />
      {isLoading && <Spinner />}
      <ResultsList results={results} />
    </>
  )
}
```

**適切（組み込み pending state 付き useTransition）:**

```tsx
import { useTransition, useState } from 'react'

function SearchResults() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isPending, startTransition] = useTransition()

  const handleSearch = (value: string) => {
    setQuery(value) // Update input immediately
    
    startTransition(async () => {
      // Fetch and update results
      const data = await fetchResults(value)
      setResults(data)
    })
  }

  return (
    <>
      <input onChange={(e) => handleSearch(e.target.value)} />
      {isPending && <Spinner />}
      <ResultsList results={results} />
    </>
  )
}
```

**メリット:**

- **自動 pending state**: `setIsLoading(true/false)` の手動管理が不要
- **エラー耐性**: transition が例外を投げても pending state は正しくリセット
- **応答性の向上**: 更新中も UI を応答性のある状態に維持
- **割り込み処理**: 新しい transition が保留中のものを自動キャンセル

参考: [useTransition](https://react.dev/reference/react/useTransition)
