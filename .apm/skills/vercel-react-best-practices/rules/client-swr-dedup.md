---
title: 自動重複排除に SWR を使用
impact: MEDIUM-HIGH
impactDescription: 自動重複排除
tags: client, swr, deduplication, data-fetching
---

## 自動重複排除に SWR を使用

SWR はコンポーネントインスタンス間でリクエスト重複排除、キャッシング、再検証を可能にします。

**不適切（重複排除なし、各インスタンスがフェッチ）:**

```tsx
function UserList() {
  const [users, setUsers] = useState([])
  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(setUsers)
  }, [])
}
```

**適切（複数インスタンスが 1 リクエストを共有）:**

```tsx
import useSWR from 'swr'

function UserList() {
  const { data: users } = useSWR('/api/users', fetcher)
}
```

**不変データの場合:**

```tsx
import { useImmutableSWR } from '@/lib/swr'

function StaticContent() {
  const { data } = useImmutableSWR('/api/config', fetcher)
}
```

**mutation の場合:**

```tsx
import { useSWRMutation } from 'swr/mutation'

function UpdateButton() {
  const { trigger } = useSWRMutation('/api/user', updateUser)
  return <button onClick={() => trigger()}>Update</button>
}
```

参考: [https://swr.vercel.app](https://swr.vercel.app)
