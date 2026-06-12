---
title: ナビゲーションにネイティブナビゲーターを使用
impact: HIGH
impactDescription: ネイティブパフォーマンス、プラットフォームに適した UI
tags: navigation, react-navigation, expo-router, native-stack, tabs
---

## ナビゲーションにネイティブナビゲーターを使用

JS ベースではなく常にネイティブナビゲーターを使用します。ネイティブナビゲーターはプラットフォーム API（iOS の UINavigationController、Android の Fragment）を使い、より良いパフォーマンスとネイティブな挙動を提供します。

**スタック:** `@react-navigation/native-stack` または expo-router のデフォルトスタック（native-stack 使用）を使います。`@react-navigation/stack` は避けてください。

**タブ:** `react-native-bottom-tabs`（ネイティブ）または expo-router のネイティブタブを使います。ネイティブな感触が重要な場合は `@react-navigation/bottom-tabs` を避けてください。

### スタックナビゲーション

**不適切（JS スタックナビゲーター）:**

```tsx
import { createStackNavigator } from '@react-navigation/stack'

const Stack = createStackNavigator()

function App() {
  return (
    <Stack.Navigator>
      <Stack.Screen name='Home' component={HomeScreen} />
      <Stack.Screen name='Details' component={DetailsScreen} />
    </Stack.Navigator>
  )
}
```

**適切（react-navigation のネイティブスタック）:**

```tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack'

const Stack = createNativeStackNavigator()

function App() {
  return (
    <Stack.Navigator>
      <Stack.Screen name='Home' component={HomeScreen} />
      <Stack.Screen name='Details' component={DetailsScreen} />
    </Stack.Navigator>
  )
}
```

**適切（expo-router はデフォルトでネイティブスタック）:**

```tsx
// app/_layout.tsx
import { Stack } from 'expo-router'

export default function Layout() {
  return <Stack />
}
```

### タブナビゲーション

**不適切（JS bottom tabs）:**

```tsx
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'

const Tab = createBottomTabNavigator()

function App() {
  return (
    <Tab.Navigator>
      <Tab.Screen name='Home' component={HomeScreen} />
      <Tab.Screen name='Settings' component={SettingsScreen} />
    </Tab.Navigator>
  )
}
```

**適切（react-navigation のネイティブ bottom tabs）:**

```tsx
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation'

const Tab = createNativeBottomTabNavigator()

function App() {
  return (
    <Tab.Navigator>
      <Tab.Screen
        name='Home'
        component={HomeScreen}
        options={{
          tabBarIcon: () => ({ sfSymbol: 'house' }),
        }}
      />
      <Tab.Screen
        name='Settings'
        component={SettingsScreen}
        options={{
          tabBarIcon: () => ({ sfSymbol: 'gear' }),
        }}
      />
    </Tab.Navigator>
  )
}
```

**適切（expo-router ネイティブタブ）:**

```tsx
// app/(tabs)/_layout.tsx
import { NativeTabs } from 'expo-router/unstable-native-tabs'

export default function TabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name='index'>
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf='house.fill' md='home' />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name='settings'>
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf='gear' md='settings' />
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
```

iOS ではネイティブタブが各タブ画面ルートの最初の `ScrollView` で `contentInsetAdjustmentBehavior` を自動有効化し、半透明タブバーの背後でコンテンツが正しくスクロールします。無効化する場合は trigger で `disableAutomaticContentInsets` を使用します。

### カスタムコンポーネントよりネイティブヘッダーオプションを優先

**不適切（カスタムヘッダーコンポーネント）:**

```tsx
<Stack.Screen
  name='Profile'
  component={ProfileScreen}
  options={{
    header: () => <CustomHeader title='Profile' />,
  }}
/>
```

**適切（ネイティブヘッダーオプション）:**

```tsx
<Stack.Screen
  name='Profile'
  component={ProfileScreen}
  options={{
    title: 'Profile',
    headerLargeTitleEnabled: true,
    headerSearchBarOptions: {
      placeholder: 'Search',
    },
  }}
/>
```

ネイティブヘッダーは iOS の large title、検索バー、ブラー効果、適切な safe area 処理を自動でサポートします。

### ネイティブナビゲーターを使う理由

- **パフォーマンス**: ネイティブ遷移とジェスチャーは UI スレッドで実行
- **プラットフォーム挙動**: iOS large title、Android Material Design を自動
- **システム統合**: タブタップでのスクロールトップ、PiP 回避、適切な safe area
- **アクセシビリティ**: プラットフォームのアクセシビリティ機能が自動で動作

参考:

- [React Navigation Native Stack](https://reactnavigation.org/docs/native-stack-navigator)
- [React Native Bottom Tabs with React Navigation](https://oss.callstack.com/react-native-bottom-tabs/docs/guides/usage-with-react-navigation)
- [React Native Bottom Tabs with Expo Router](https://oss.callstack.com/react-native-bottom-tabs/docs/guides/usage-with-expo-router)
- [Expo Router Native Tabs](https://docs.expo.dev/router/advanced/native-tabs)
