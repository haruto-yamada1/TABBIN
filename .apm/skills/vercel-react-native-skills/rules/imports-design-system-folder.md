---
title: デザインシステムフォルダからインポート
impact: LOW
impactDescription: グローバル変更と容易なリファクタリングを可能に
tags: imports, architecture, design-system
---

## デザインシステムフォルダからインポート

デザインシステムフォルダから依存関係を再エクスポートします。アプリコードはパッケージから直接ではなく、そこからインポートします。これによりグローバル変更と容易なリファクタリングが可能になります。

**不適切（パッケージから直接インポート）:**

```tsx
import { View, Text } from 'react-native'
import { Button } from '@ui/button'

function Profile() {
  return (
    <View>
      <Text>Hello</Text>
      <Button>Save</Button>
    </View>
  )
}
```

**適切（デザインシステムからインポート）:**

```tsx
// components/view.tsx
import { View as RNView } from 'react-native'

// ideal: pick the props you will actually use to control implementation
export function View(
  props: Pick<React.ComponentProps<typeof RNView>, 'style' | 'children'>
) {
  return <RNView {...props} />
}
```

```tsx
// components/text.tsx
export { Text } from 'react-native'
```

```tsx
// components/button.tsx
export { Button } from '@ui/button'
```

```tsx
import { View } from '@/components/view'
import { Text } from '@/components/text'
import { Button } from '@/components/button'

function Profile() {
  return (
    <View>
      <Text>Hello</Text>
      <Button>Save</Button>
    </View>
  )
}
```

まず単純な再エクスポートから始め、後からアプリコードを変えずにカスタマイズできます。
