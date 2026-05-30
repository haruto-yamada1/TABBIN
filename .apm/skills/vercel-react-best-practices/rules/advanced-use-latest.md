---
title: 安定したコールバック ref に useEffectEvent
impact: LOW
impactDescription: effect の再実行を防ぐ
tags: advanced, hooks, useEffectEvent, refs, optimization
---

## 安定したコールバック ref に useEffectEvent

依存配列に追加せずにコールバックで最新値にアクセスします。effect の再実行を防ぎつつ stale closure を回避します。

**不適切（コールバック変更ごとに effect が再実行）:**

```tsx
function SearchInput({ onSearch }: { onSearch: (q: string) => void }) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    const timeout = setTimeout(() => onSearch(query), 300)
    return () => clearTimeout(timeout)
  }, [query, onSearch])
}
```

**適切（React の useEffectEvent を使用）:**

```tsx
import { useEffectEvent } from 'react';

function SearchInput({ onSearch }: { onSearch: (q: string) => void }) {
  const [query, setQuery] = useState('')
  const onSearchEvent = useEffectEvent(onSearch)

  useEffect(() => {
    const timeout = setTimeout(() => onSearchEvent(query), 300)
    return () => clearTimeout(timeout)
  }, [query])
}
```
