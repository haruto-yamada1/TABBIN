---
title: インタラクションロジックをイベントハンドラーに置く
impact: MEDIUM
impactDescription: effect の再実行と副作用の重複を回避
tags: rerender, useEffect, events, side-effects, dependencies
---

## インタラクションロジックをイベントハンドラーに置く

特定のユーザー操作（submit、click、drag）でトリガーされる副作用は、そのイベントハンドラー内で実行します。操作を state + effect としてモデル化しないでください。無関係な変更で effect が再実行され、アクションが重複する可能性があります。

**不適切（イベントを state + effect としてモデル化）:**

```tsx
function Form() {
  const [submitted, setSubmitted] = useState(false)
  const theme = useContext(ThemeContext)

  useEffect(() => {
    if (submitted) {
      post('/api/register')
      showToast('Registered', theme)
    }
  }, [submitted, theme])

  return <button onClick={() => setSubmitted(true)}>Submit</button>
}
```

**適切（ハンドラー内で実行）:**

```tsx
function Form() {
  const theme = useContext(ThemeContext)

  function handleSubmit() {
    post('/api/register')
    showToast('Registered', theme)
  }

  return <button onClick={handleSubmit}>Submit</button>
}
```

参考: [Should this code move to an event handler?](https://react.dev/learn/removing-effect-dependencies#should-this-code-move-to-an-event-handler)
