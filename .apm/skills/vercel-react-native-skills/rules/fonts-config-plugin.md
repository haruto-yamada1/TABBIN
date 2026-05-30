---
title: ビルド時にネイティブでフォントを読み込む
impact: LOW
impactDescription: 起動時にフォント利用可能、非同期読み込み不要
tags: fonts, expo, performance, config-plugin
---

## フォント読み込みに Expo Config Plugin を使用

`useFonts` や `Font.loadAsync` の代わりに `expo-font` config plugin でビルド時にフォントを埋め込みます。埋め込みフォントの方が効率的です。

**不適切（非同期フォント読み込み）:**

```tsx
import { useFonts } from 'expo-font'
import { Text, View } from 'react-native'

function App() {
  const [fontsLoaded] = useFonts({
    'Geist-Bold': require('./assets/fonts/Geist-Bold.otf'),
  })

  if (!fontsLoaded) {
    return null
  }

  return (
    <View>
      <Text style={{ fontFamily: 'Geist-Bold' }}>Hello</Text>
    </View>
  )
}
```

**適切（config plugin、ビルド時にフォント埋め込み）:**

```json
// app.json
{
  "expo": {
    "plugins": [
      [
        "expo-font",
        {
          "fonts": ["./assets/fonts/Geist-Bold.otf"]
        }
      ]
    ]
  }
}
```

```tsx
import { Text, View } from 'react-native'

function App() {
  // No loading state needed—font is already available
  return (
    <View>
      <Text style={{ fontFamily: 'Geist-Bold' }}>Hello</Text>
    </View>
  )
}
```

config plugin にフォントを追加した後、`npx expo prebuild` を実行しネイティブアプリを再ビルドしてください。

参考:
[Expo Font Documentation](https://docs.expo.dev/versions/latest/sdk/font/)
