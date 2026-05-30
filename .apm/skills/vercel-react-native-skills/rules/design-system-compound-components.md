---
title: 多態的 children より複合コンポーネントを使用
impact: MEDIUM
impactDescription: 柔軟な合成、明確な API
tags: design-system, components, composition
---

## 多態的 children より複合コンポーネントを使用

テキストノードでないコンポーネントが文字列を受け取れるようにしないでください。文字列の子を受け取れる場合は専用の `*Text` コンポーネントである必要があります。View（または Pressable）とテキストの両方を持つボタンなどには、`Button`、`ButtonText`、`ButtonIcon` のような複合コンポーネントを使用します。

**不適切（多態的 children）:**

```tsx
import { Pressable, Text } from 'react-native'

type ButtonProps = {
  children: string | React.ReactNode
  icon?: React.ReactNode
}

function Button({ children, icon }: ButtonProps) {
  return (
    <Pressable>
      {icon}
      {typeof children === 'string' ? <Text>{children}</Text> : children}
    </Pressable>
  )
}

// Usage is ambiguous
<Button icon={<Icon />}>Save</Button>
<Button><CustomText>Save</CustomText></Button>
```

**適切（複合コンポーネント）:**

```tsx
import { Pressable, Text } from 'react-native'

function Button({ children }: { children: React.ReactNode }) {
  return <Pressable>{children}</Pressable>
}

function ButtonText({ children }: { children: React.ReactNode }) {
  return <Text>{children}</Text>
}

function ButtonIcon({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

// Usage is explicit and composable
<Button>
  <ButtonIcon><SaveIcon /></ButtonIcon>
  <ButtonText>Save</ButtonText>
</Button>

<Button>
  <ButtonText>Cancel</ButtonText>
</Button>
```
