---
title: バレルファイルインポートを避ける
impact: CRITICAL
impactDescription: 200〜800ms のインポートコスト、ビルドの遅延
tags: bundle, imports, tree-shaking, barrel-files, performance
---

## バレルファイルインポートを避ける

未使用の数千モジュールを読み込まないよう、バレルファイルではなくソースファイルから直接インポートします。**バレルファイル**は複数モジュールを再エクスポートするエントリポイントです（例: `export * from './module'` を行う `index.js`）。

人気のアイコン・コンポーネントライブラリはエントリファイルに **最大 10,000 件の再エクスポート** を持つことがあります。多くの React パッケージでは **インポートだけで 200〜800ms かかり**、開発速度と本番のコールドスタートの両方に影響します。

**tree-shaking が効かない理由:** ライブラリが external（バンドルされない）としてマークされている場合、バンドラーは最適化できません。tree-shaking を有効にするためにバンドルすると、モジュールグラフ全体の解析でビルドが大幅に遅くなります。

**不適切（ライブラリ全体をインポート）:**

```tsx
import { Check, X, Menu } from 'lucide-react'
// Loads 1,583 modules, takes ~2.8s extra in dev
// Runtime cost: 200-800ms on every cold start

import { Button, TextField } from '@mui/material'
// Loads 2,225 modules, takes ~4.2s extra in dev
```

**適切（必要なものだけインポート）:**

```tsx
import Check from 'lucide-react/dist/esm/icons/check'
import X from 'lucide-react/dist/esm/icons/x'
import Menu from 'lucide-react/dist/esm/icons/menu'
// Loads only 3 modules (~2KB vs ~1MB)

import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
// Loads only what you use
```

直接インポートにより、dev 起動が 15〜70% 高速化、ビルドが 28% 高速化、コールドスタートが 40% 高速化、HMR が大幅に高速化されます。

よく影響を受けるライブラリ: `lucide-react`、`@mui/material`、`@mui/icons-material`、`@tabler/icons-react`、`react-icons`、`@headlessui/react`、`@radix-ui/react-*`、`lodash`、`ramda`、`date-fns`、`rxjs`、`react-use`。

