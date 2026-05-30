---
title: 条件付きモジュール読み込み
impact: HIGH
impactDescription: 大きなデータを必要な時だけ読み込み
tags: bundle, conditional-loading, lazy-loading
---

## 条件付きモジュール読み込み

機能が有効化された時のみ、大きなデータやモジュールを読み込みます。

**例（アニメーションフレームの遅延読み込み）:**

```tsx
function AnimationPlayer({ enabled, setEnabled }: { enabled: boolean; setEnabled: React.Dispatch<React.SetStateAction<boolean>> }) {
  const [frames, setFrames] = useState<Frame[] | null>(null)

  useEffect(() => {
    if (enabled && !frames && typeof window !== 'undefined') {
      import('./animation-frames.js')
        .then(mod => setFrames(mod.frames))
        .catch(() => setEnabled(false))
    }
  }, [enabled, frames, setEnabled])

  if (!frames) return <Skeleton />
  return <Canvas frames={frames} />
}
```

`typeof window !== 'undefined'` チェックにより SSR 用にこのモジュールがバンドルされるのを防ぎ、サーバーバンドルサイズとビルド速度を最適化します。
