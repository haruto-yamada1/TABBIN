---
title: 戦略的な Suspense 境界
impact: HIGH
impactDescription: 初期描画の高速化
tags: async, suspense, streaming, layout-shift
---

## 戦略的な Suspense 境界

async コンポーネントで JSX を返す前にデータを await する代わりに、Suspense 境界を使ってデータ読み込み中もラッパー UI を早く表示します。

**不適切（データフェッチがラッパーをブロック）:**

```tsx
async function Page() {
  const data = await fetchData() // Blocks entire page
  
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

**適切（ラッパーは即座に表示、データはストリーミング）:**

```tsx
function Page() {
  return (
    <div>
      <div>Sidebar</div>
      <div>Header</div>
      <div>
        <Suspense fallback={<Skeleton />}>
          <DataDisplay />
        </Suspense>
      </div>
      <div>Footer</div>
    </div>
  )
}

async function DataDisplay() {
  const data = await fetchData() // Only blocks this component
  return <div>{data.content}</div>
}
```

Sidebar、Header、Footer は即座にレンダリングされます。DataDisplay だけがデータを待ちます。

**代替案（コンポーネント間で Promise を共有）:**

```tsx
function Page() {
  // Start fetch immediately, but don't await
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

両コンポーネントが同じ Promise を共有するため、フェッチは 1 回だけです。レイアウトは即座にレンダリングされ、両コンポーネントが一緒に待ちます。

**このパターンを使わない場合:**

- レイアウト判断に必要なクリティカルなデータ（配置に影響）
- ファーストビューで SEO 上重要なコンテンツ
- Suspense のオーバーヘッドに見合わない小さく高速なクエリ
- レイアウトシフト（読み込み → コンテンツのジャンプ）を避けたい場合

**トレードオフ:** 初期描画の高速化 vs レイアウトシフトの可能性。UX の優先度に応じて選択してください。
