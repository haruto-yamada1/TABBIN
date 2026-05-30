---
title: 安定したオブジェクト参照でリストパフォーマンスを最適化
impact: CRITICAL
impactDescription: 仮想化は参照の安定性に依存
tags: lists, performance, flatlist, virtualization
---

## 安定したオブジェクト参照でリストパフォーマンスを最適化

仮想化リストに渡す前にデータを map や filter しないでください。仮想化は何が変わったかを知るためにオブジェクト参照の安定性に依存します。新しい参照は表示中のすべてのアイテムの完全再レンダーを引き起こします。リスト親レベルでの頻繁なレンダーを防いでください。

必要に応じて、リストアイテム内で context セレクターを使用します。

**不適切（キー入力ごとに新しいオブジェクト参照を作成）:**

```tsx
function DomainSearch() {
  const { keyword, setKeyword } = useKeywordZustandState()
  const { data: tlds } = useTlds()

  // Bad: creates new objects on every render, reparenting the entire list on every keystroke
  const domains = tlds.map((tld) => ({
    domain: `${keyword}.${tld.name}`,
    tld: tld.name,
    price: tld.price,
  }))

  return (
    <>
      <TextInput value={keyword} onChangeText={setKeyword} />
      <LegendList
        data={domains}
        renderItem={({ item }) => <DomainItem item={item} keyword={keyword} />}
      />
    </>
  )
}
```

**適切（安定した参照、アイテム内で変換）:**

```tsx
const renderItem = ({ item }) => <DomainItem tld={item} />

function DomainSearch() {
  const { data: tlds } = useTlds()

  return (
    <LegendList
      // good: as long as the data is stable, LegendList will not re-render the entire list
      data={tlds}
      renderItem={renderItem}
    />
  )
}

function DomainItem({ tld }: { tld: Tld }) {
  // good: transform within items, and don't pass the dynamic data as a prop
  // good: use a selector function from zustand to receive a stable string back
  const domain = useKeywordZustandState((s) => s.keyword + '.' + tld.name)
  return <Text>{domain}</Text>
}
```

**親配列参照の更新:**

内部オブジェクト参照が安定していれば、新しい配列インスタンスの作成は問題ありません。例えばオブジェクトのリストをソートする場合:

```tsx
// good: creates a new array instance without mutating the inner objects
// good: parent array reference is unaffected by typing and updating "keyword"
const sortedTlds = tlds.toSorted((a, b) => a.name.localeCompare(b.name))

return <LegendList data={sortedTlds} renderItem={renderItem} />
```

`sortedTlds` という新しい配列インスタンスを作っても、内部オブジェクト参照は安定しています。

**動的データに zustand を使用（親の再レンダーを回避）:**

```tsx
const useSearchStore = create<{ keyword: string }>(() => ({ keyword: '' }))

function DomainSearch() {
  const { data: tlds } = useTlds()

  return (
    <>
      <SearchInput />
      <LegendList
        data={tlds}
        // if you aren't using React Compiler, wrap renderItem with useCallback
        renderItem={({ item }) => <DomainItem tld={item} />}
      />
    </>
  )
}

function DomainItem({ tld }: { tld: Tld }) {
  // Select only what you need—component only re-renders when keyword changes
  const keyword = useSearchStore((s) => s.keyword)
  const domain = `${keyword}.${tld.name}`
  return <Text>{domain}</Text>
}
```

入力時、仮想化は変更のないアイテムをスキップできます。親ではなく表示中のアイテム（約 20 件）だけがキー入力ごとに再レンダーされます。

**親データに基づくリストアイテム内での state 派生（親の再レンダーを回避）:**

データが親 state に条件付きで依存するコンポーネントでは、このパターンはさらに重要です。例えばアイテムがお気に入りかどうかを確認する場合、親ではなくアイテム自身が state にアクセスすると、お気に入り切り替えは 1 コンポーネントだけ再レンダーします:

```tsx
function DomainItemFavoriteButton({ tld }: { tld: Tld }) {
  const isFavorited = useFavoritesStore((s) => s.favorites.has(tld.id))
  return <TldFavoriteButton isFavorited={isFavorited} />
}
```

注: React Compiler を使用している場合、リストアイテム内で React Context 値を直接読めます。多くの場合 Zustand セレクターよりやや遅いですが、影響は無視できる程度のことが多いです。
