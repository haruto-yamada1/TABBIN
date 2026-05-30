---
title: JS ベース Bottom Sheet よりネイティブ Modal を使用
impact: HIGH
impactDescription: ネイティブパフォーマンス、ジェスチャー、アクセシビリティ
tags: modals, bottom-sheet, native, react-navigation
---

## JS ベース Bottom Sheet よりネイティブ Modal を使用

JS ベースの bottom sheet ライブラリの代わりに、ネイティブ `<Modal>` と `presentationStyle="formSheet"`、または React Navigation v7 のネイティブ form sheet を使用します。ネイティブ modal は組み込みジェスチャー、アクセシビリティ、より良いパフォーマンスを持ちます。低レベルプリミティブはネイティブ UI に任せます。

**不適切（JS ベース bottom sheet）:**

```tsx
import BottomSheet from 'custom-js-bottom-sheet'

function MyScreen() {
  const sheetRef = useRef<BottomSheet>(null)

  return (
    <View style={{ flex: 1 }}>
      <Button onPress={() => sheetRef.current?.expand()} title='Open' />
      <BottomSheet ref={sheetRef} snapPoints={['50%', '90%']}>
        <View>
          <Text>Sheet content</Text>
        </View>
      </BottomSheet>
    </View>
  )
}
```

**適切（formSheet 付きネイティブ Modal）:**

```tsx
import { Modal, View, Text, Button } from 'react-native'

function MyScreen() {
  const [visible, setVisible] = useState(false)

  return (
    <View style={{ flex: 1 }}>
      <Button onPress={() => setVisible(true)} title='Open' />
      <Modal
        visible={visible}
        presentationStyle='formSheet'
        animationType='slide'
        onRequestClose={() => setVisible(false)}
      >
        <View>
          <Text>Sheet content</Text>
        </View>
      </Modal>
    </View>
  )
}
```

**適切（React Navigation v7 ネイティブ form sheet）:**

```tsx
// In your navigator
<Stack.Screen
  name='Details'
  component={DetailsScreen}
  options={{
    presentation: 'formSheet',
    sheetAllowedDetents: 'fitToContents',
  }}
/>
```

ネイティブ modal はスワイプで閉じる、適切なキーボード回避、アクセシビリティを標準で提供します。
