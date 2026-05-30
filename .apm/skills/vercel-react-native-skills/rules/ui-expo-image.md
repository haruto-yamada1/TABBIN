---
title: 最適化画像に expo-image を使用
impact: HIGH
impactDescription: メモリ効率、キャッシュ、blurhash プレースホルダー、プログレッシブ読み込み
tags: images, performance, expo-image, ui
---

## 最適化画像に expo-image を使用

React Native の `Image` の代わりに `expo-image` を使用します。メモリ効率の良いキャッシュ、blurhash プレースホルダー、プログレッシブ読み込み、リスト向けのより良いパフォーマンスを提供します。

**不適切（React Native Image）:**

```tsx
import { Image } from 'react-native'

function Avatar({ url }: { url: string }) {
  return <Image source={{ uri: url }} style={styles.avatar} />
}
```

**適切（expo-image）:**

```tsx
import { Image } from 'expo-image'

function Avatar({ url }: { url: string }) {
  return <Image source={{ uri: url }} style={styles.avatar} />
}
```

**blurhash プレースホルダー付き:**

```tsx
<Image
  source={{ uri: url }}
  placeholder={{ blurhash: 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.' }}
  contentFit="cover"
  transition={200}
  style={styles.image}
/>
```

**priority と caching 付き:**

```tsx
<Image
  source={{ uri: url }}
  priority="high"
  cachePolicy="memory-disk"
  style={styles.hero}
/>
```

**主要 props:**

- `placeholder` — 読み込み中の Blurhash またはサムネイル
- `contentFit` — `cover`、`contain`、`fill`、`scale-down`
- `transition` — フェードイン時間（ms）
- `priority` — `low`、`normal`、`high`
- `cachePolicy` — `memory`、`disk`、`memory-disk`、`none`
- `recyclingKey` — リストリサイクル用の一意キー

クロスプラットフォーム（web + native）では、内部で `expo-image` を使う `solito/image` の `SolitoImage` を使用します。

参考: [expo-image](https://docs.expo.dev/versions/latest/sdk/image/)
