---
title: ドロップダウンとコンテキストメニューにネイティブメニューを使用
impact: HIGH
impactDescription: ネイティブアクセシビリティ、プラットフォーム一貫の UX
tags: user-interface, menus, context-menus, zeego, accessibility
---

## ドロップダウンとコンテキストメニューにネイティブメニューを使用

カスタム JS 実装の代わりにネイティブプラットフォームメニューを使用します。ネイティブメニューは組み込みアクセシビリティ、一貫したプラットフォーム UX、より良いパフォーマンスを提供します。クロスプラットフォームネイティブメニューには [zeego](https://zeego.dev) を使用します。

**不適切（カスタム JS メニュー）:**

```tsx
import { useState } from 'react'
import { View, Pressable, Text } from 'react-native'

function MyMenu() {
  const [open, setOpen] = useState(false)

  return (
    <View>
      <Pressable onPress={() => setOpen(!open)}>
        <Text>Open Menu</Text>
      </Pressable>
      {open && (
        <View style={{ position: 'absolute', top: 40 }}>
          <Pressable onPress={() => console.log('edit')}>
            <Text>Edit</Text>
          </Pressable>
          <Pressable onPress={() => console.log('delete')}>
            <Text>Delete</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}
```

**適切（zeego によるネイティブメニュー）:**

```tsx
import * as DropdownMenu from 'zeego/dropdown-menu'

function MyMenu() {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <Pressable>
          <Text>Open Menu</Text>
        </Pressable>
      </DropdownMenu.Trigger>

      <DropdownMenu.Content>
        <DropdownMenu.Item key='edit' onSelect={() => console.log('edit')}>
          <DropdownMenu.ItemTitle>Edit</DropdownMenu.ItemTitle>
        </DropdownMenu.Item>

        <DropdownMenu.Item
          key='delete'
          destructive
          onSelect={() => console.log('delete')}
        >
          <DropdownMenu.ItemTitle>Delete</DropdownMenu.ItemTitle>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  )
}
```

**コンテキストメニュー（長押し）:**

```tsx
import * as ContextMenu from 'zeego/context-menu'

function MyContextMenu() {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>
        <View style={{ padding: 20 }}>
          <Text>Long press me</Text>
        </View>
      </ContextMenu.Trigger>

      <ContextMenu.Content>
        <ContextMenu.Item key='copy' onSelect={() => console.log('copy')}>
          <ContextMenu.ItemTitle>Copy</ContextMenu.ItemTitle>
        </ContextMenu.Item>

        <ContextMenu.Item key='paste' onSelect={() => console.log('paste')}>
          <ContextMenu.ItemTitle>Paste</ContextMenu.ItemTitle>
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Root>
  )
}
```

**チェックボックス項目:**

```tsx
import * as DropdownMenu from 'zeego/dropdown-menu'

function SettingsMenu() {
  const [notifications, setNotifications] = useState(true)

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <Pressable>
          <Text>Settings</Text>
        </Pressable>
      </DropdownMenu.Trigger>

      <DropdownMenu.Content>
        <DropdownMenu.CheckboxItem
          key='notifications'
          value={notifications}
          onValueChange={() => setNotifications((prev) => !prev)}
        >
          <DropdownMenu.ItemIndicator />
          <DropdownMenu.ItemTitle>Notifications</DropdownMenu.ItemTitle>
        </DropdownMenu.CheckboxItem>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  )
}
```

**サブメニュー:**

```tsx
import * as DropdownMenu from 'zeego/dropdown-menu'

function MenuWithSubmenu() {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <Pressable>
          <Text>Options</Text>
        </Pressable>
      </DropdownMenu.Trigger>

      <DropdownMenu.Content>
        <DropdownMenu.Item key='home' onSelect={() => console.log('home')}>
          <DropdownMenu.ItemTitle>Home</DropdownMenu.ItemTitle>
        </DropdownMenu.Item>

        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger key='more'>
            <DropdownMenu.ItemTitle>More Options</DropdownMenu.ItemTitle>
          </DropdownMenu.SubTrigger>

          <DropdownMenu.SubContent>
            <DropdownMenu.Item key='settings'>
              <DropdownMenu.ItemTitle>Settings</DropdownMenu.ItemTitle>
            </DropdownMenu.Item>

            <DropdownMenu.Item key='help'>
              <DropdownMenu.ItemTitle>Help</DropdownMenu.ItemTitle>
            </DropdownMenu.Item>
          </DropdownMenu.SubContent>
        </DropdownMenu.Sub>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  )
}
```

参考: [Zeego Documentation](https://zeego.dev/components/dropdown-menu)
