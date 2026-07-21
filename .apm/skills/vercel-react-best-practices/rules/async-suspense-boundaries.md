---
title: 戦略的な Suspense 境界
impact: HIGH
impactDescription: 初期描画の高速化
tags: async, suspense, react-use, layout-shift
---

## 戦略的な Suspense 境界

データ待ちで UI 全体をブロックする代わりに、Suspense 境界を使ってデータを読み込む部分だけを後回しにし、残りの UI を即座に表示します。React 19 の `use(promise)` で Promise を unwrap しつつ、フェッチはコンポーネント外で即座に開始します。

**不適切（データフェッチが UI 全体をブロック）:**

```tsx
function Page() {
  const data = use(fetchData()) // Promise をその場で作って await 相当 → 全体が待たされる

  return (
    <div>
      <div>Sidebar</div>
      <div>Header</div>
      <div>
        <DataDisplay data={data} />
      </div>
      <div>Footer</div>
    </div>
  )
}
```

中間セクションだけがデータを必要とするのに、レイアウト全体がデータを待ちます。

**適切（ラッパーは即座に表示、データ部分だけ Suspense）:**

```tsx
import { Suspense, use } from 'react'

function Page() {
  const dataPromise = fetchData() // Start immediately, don't await here

  return (
    <div>
      <div>Sidebar</div>
      <div>Header</div>
      <Suspense fallback={<Skeleton />}>
        <DataDisplay dataPromise={dataPromise} />
      </Suspense>
      <div>Footer</div>
    </div>
  )
}

function DataDisplay({ dataPromise }: { dataPromise: Promise<Data> }) {
  const data = use(dataPromise) // Suspends until resolved
  return <div>{data.content}</div>
}
```

Sidebar、Header、Footer は即座にレンダリングされます。DataDisplay だけがデータを待ちます。

**コンポーネント間で Promise を共有:**

```tsx
function Page() {
  const dataPromise = fetchData()

  return (
    <div>
      <div>Sidebar</div>
      <div>Header</div>
      <Suspense fallback={<Skeleton />}>
        <DataDisplay dataPromise={dataPromise} />
        <DataSummary dataPromise={dataPromise} />
      </Suspense>
      <div>Footer</div>
    </div>
  )
}

function DataDisplay({ dataPromise }: { dataPromise: Promise<Data> }) {
  const data = use(dataPromise) // Unwraps the promise
  return <div>{data.content}</div>
}

function DataSummary({ dataPromise }: { dataPromise: Promise<Data> }) {
  const data = use(dataPromise) // Reuses the same promise
  return <div>{data.summary}</div>
}
```

両コンポーネントが同じ Promise を共有するため、フェッチは 1 回だけです。

**このパターンを使わない場合:**

- レイアウト判断に必要なクリティカルなデータ（配置に影響）
- Suspense のオーバーヘッドに見合わない小さく高速なクエリ
- レイアウトシフト（読み込み → コンテンツのジャンプ）を避けたい場合

**トレードオフ:** 初期描画の高速化 vs レイアウトシフトの可能性。UX の優先度に応じて選択してください。
