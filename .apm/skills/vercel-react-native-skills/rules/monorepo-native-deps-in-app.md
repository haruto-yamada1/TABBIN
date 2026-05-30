---
title: アプリディレクトリにネイティブ依存関係をインストール
impact: CRITICAL
impactDescription: autolinking 動作に必須
tags: monorepo, native, autolinking, installation
---

## アプリディレクトリにネイティブ依存関係をインストール

モノレポでは、ネイティブコードを含むパッケージをネイティブアプリのディレクトリに直接インストールする必要があります。autolinking はアプリの `node_modules` のみをスキャンし、他パッケージにインストールされたネイティブ依存関係は見つけません。

**不適切（共有パッケージのみにネイティブ dep）:**

```
packages/
  ui/
    package.json  # has react-native-reanimated
  app/
    package.json  # missing react-native-reanimated
```

autolinking 失敗 — ネイティブコードがリンクされない。

**適切（アプリディレクトリにもネイティブ dep）:**

```
packages/
  ui/
    package.json  # has react-native-reanimated
  app/
    package.json  # also has react-native-reanimated
```

```json
// packages/app/package.json
{
  "dependencies": {
    "react-native-reanimated": "3.16.1"
  }
}
```

共有パッケージがネイティブ依存関係を使っていても、autolinking がネイティブコードを検出・リンクするにはアプリ側にも記載が必要です。
