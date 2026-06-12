---
title: 動的 ScrollView スペーシングに contentInset を使用
impact: LOW
impactDescription: スムーズな更新、レイアウト再計算なし
tags: scrollview, layout, contentInset, performance
---

## 動的 ScrollView スペーシングに contentInset を使用

ScrollView の上下に追加するスペースが変わり得る場合（キーボード、ツールバー、動的コンテンツ）、padding の代わりに `contentInset` を使用します。`contentInset` の変更はレイアウト再計算をトリガーせず、コンテンツを再レンダーせずにスクロール領域を調整します。

**不適切（padding がレイアウト再計算を引き起こす）:**

```tsx
function Feed({ bottomOffset }: { bottomOffset: number }) {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: bottomOffset }}>
      {children}
    </ScrollView>
  )
}
// Changing bottomOffset triggers full layout recalculation
```

**適切（動的スペーシングに contentInset）:**

```tsx
function Feed({ bottomOffset }: { bottomOffset: number }) {
  return (
    <ScrollView
      contentInset={{ bottom: bottomOffset }}
      scrollIndicatorInsets={{ bottom: bottomOffset }}
    >
      {children}
    </ScrollView>
  )
}
// Changing bottomOffset only adjusts scroll bounds
```

スクロールインジケーターを揃えるため `contentInset` と一緒に `scrollIndicatorInsets` を使用します。決して変わらない静的スペーシングには padding で問題ありません。
