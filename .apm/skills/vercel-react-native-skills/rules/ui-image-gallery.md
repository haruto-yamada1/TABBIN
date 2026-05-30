---
title: 画像ギャラリーとライトボックスに Galeria を使用
impact: MEDIUM
impactDescription: ネイティブ shared element 遷移、ピンチズーム、パンで閉じる
tags: images, gallery, lightbox, expo-image, ui
---

## 画像ギャラリーとライトボックスに Galeria を使用

ライトボックス付き画像ギャラリー（タップで全画面）には `@nandorojo/galeria` を使用します。ピンチズーム、ダブルタップズーム、パンで閉じるネイティブ shared element 遷移を提供します。`expo-image` を含む任意の画像コンポーネントと動作します。

**不適切（カスタム modal 実装）:**

```tsx
function ImageGallery({ urls }: { urls: string[] }) {
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <>
      {urls.map((url) => (
        <Pressable key={url} onPress={() => setSelected(url)}>
          <Image source={{ uri: url }} style={styles.thumbnail} />
        </Pressable>
      ))}
      <Modal visible={!!selected} onRequestClose={() => setSelected(null)}>
        <Image source={{ uri: selected! }} style={styles.fullscreen} />
      </Modal>
    </>
  )
}
```

**適切（expo-image 付き Galeria）:**

```tsx
import { Galeria } from '@nandorojo/galeria'
import { Image } from 'expo-image'

function ImageGallery({ urls }: { urls: string[] }) {
  return (
    <Galeria urls={urls}>
      {urls.map((url, index) => (
        <Galeria.Image index={index} key={url}>
          <Image source={{ uri: url }} style={styles.thumbnail} />
        </Galeria.Image>
      ))}
    </Galeria>
  )
}
```

**単一画像:**

```tsx
import { Galeria } from '@nandorojo/galeria'
import { Image } from 'expo-image'

function Avatar({ url }: { url: string }) {
  return (
    <Galeria urls={[url]}>
      <Galeria.Image>
        <Image source={{ uri: url }} style={styles.avatar} />
      </Galeria.Image>
    </Galeria>
  )
}
```

**低解像度サムネイルと高解像度全画面:**

```tsx
<Galeria urls={highResUrls}>
  {lowResUrls.map((url, index) => (
    <Galeria.Image index={index} key={url}>
      <Image source={{ uri: url }} style={styles.thumbnail} />
    </Galeria.Image>
  ))}
</Galeria>
```

**FlashList 付き:**

```tsx
<Galeria urls={urls}>
  <FlashList
    data={urls}
    renderItem={({ item, index }) => (
      <Galeria.Image index={index}>
        <Image source={{ uri: item }} style={styles.thumbnail} />
      </Galeria.Image>
    )}
    numColumns={3}
    estimatedItemSize={100}
  />
</Galeria>
```

`expo-image`、`SolitoImage`、`react-native` Image、任意の画像コンポーネントと動作します。

参考: [Galeria](https://github.com/nandorojo/galeria)
