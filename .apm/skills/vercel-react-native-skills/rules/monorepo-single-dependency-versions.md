---
title: モノレポ全体で単一依存バージョンを使用
impact: MEDIUM
impactDescription: 重複バンドルとバージョン競合を回避
tags: monorepo, dependencies, installation
---

## モノレポ全体で単一依存バージョンを使用

モノレポ内のすべてのパッケージで各依存関係の単一バージョンを使用します。範囲指定より exact バージョンを優先します。複数バージョンはバンドル内の重複コード、ランタイム競合、パッケージ間の一貫しない挙動を引き起こします。

syncpack などのツールで強制します。最終手段として yarn resolutions または npm overrides を使用します。

**不適切（バージョン範囲、複数バージョン）:**

```json
// packages/app/package.json
{
  "dependencies": {
    "react-native-reanimated": "^3.0.0"
  }
}

// packages/ui/package.json
{
  "dependencies": {
    "react-native-reanimated": "^3.5.0"
  }
}
```

**適切（exact バージョン、単一の source of truth）:**

```json
// package.json (root)
{
  "pnpm": {
    "overrides": {
      "react-native-reanimated": "3.16.1"
    }
  }
}

// packages/app/package.json
{
  "dependencies": {
    "react-native-reanimated": "3.16.1"
  }
}

// packages/ui/package.json
{
  "dependencies": {
    "react-native-reanimated": "3.16.1"
  }
}
```

ルートでパッケージマネージャーの override/resolution 機能を使いバージョンを強制します。依存関係追加時は `^` や `~` なしの exact バージョンを指定します。
