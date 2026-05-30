---
name: gif
description: Remotion での GIF 埋め込み
metadata:
  tags: gif, animation, images, animated, apng, avif, webp
---

# Remotion でのアニメーション画像の利用

## 基本用法

Remotion の timeline に同期して GIF、APNG、AVIF、WebP を表示するには `<AnimatedImage>` を使います:

```tsx
import { AnimatedImage, staticFile } from "remotion";

export const MyComposition = () => {
  return <AnimatedImage src={staticFile("animation.gif")} width={500} height={500} />;
};
```

リモート URL も利用できます（CORS が有効である必要があります）:

```tsx
<AnimatedImage src="https://example.com/animation.gif" width={500} height={500} />
```

## サイズと fit

`fit` prop で画像がコンテナをどう埋めるか制御します:

```tsx
// 引き伸ばして埋める（既定）
<AnimatedImage src={staticFile("animation.gif")} width={500} height={300} fit="fill" />

// アスペクト比を維持し、コンテナ内に収める
<AnimatedImage src={staticFile("animation.gif")} width={500} height={300} fit="contain" />

// コンテナを埋め、必要ならクロップ
<AnimatedImage src={staticFile("animation.gif")} width={500} height={300} fit="cover" />
```

## 再生速度

`playbackRate` でアニメーション速度を制御します:

```tsx
<AnimatedImage src={staticFile("animation.gif")} width={500} height={500} playbackRate={2} /> {/* 2倍速 */}
<AnimatedImage src={staticFile("animation.gif")} width={500} height={500} playbackRate={0.5} /> {/* 半分の速度 */}
```

## ループ動作

アニメーション終了時の挙動を制御します:

```tsx
// 無限ループ（既定）
<AnimatedImage src={staticFile("animation.gif")} width={500} height={500} loopBehavior="loop" />

// 1 回再生し、最終フレームを表示
<AnimatedImage src={staticFile("animation.gif")} width={500} height={500} loopBehavior="pause-after-finish" />

// 1 回再生後、キャンバスをクリア
<AnimatedImage src={staticFile("animation.gif")} width={500} height={500} loopBehavior="clear-after-finish" />
```

## スタイリング

追加 CSS には `style` prop を使います（サイズ指定は `width` / `height` prop を使います）:

```tsx
<AnimatedImage
  src={staticFile("animation.gif")}
  width={500}
  height={500}
  style={{
    borderRadius: 20,
    position: "absolute",
    top: 100,
    left: 50,
  }}
/>
```

## GIF の長さを取得

`@remotion/gif` の `getGifDurationInSeconds()` で GIF の長さを取得できます。

```bash
npx remotion add @remotion/gif
```

```tsx
import { getGifDurationInSeconds } from "@remotion/gif";
import { staticFile } from "remotion";

const duration = await getGifDurationInSeconds(staticFile("animation.gif"));
console.log(duration); // 例: 2.5
```

composition の duration を GIF に合わせるときに便利です:

```tsx
import { getGifDurationInSeconds } from "@remotion/gif";
import { staticFile, CalculateMetadataFunction } from "remotion";

const calculateMetadata: CalculateMetadataFunction = async () => {
  const duration = await getGifDurationInSeconds(staticFile("animation.gif"));
  return {
    durationInFrames: Math.ceil(duration * 30),
  };
};
```

## 代替手段

`<AnimatedImage>` が使えない場合（Chrome と Firefox のみサポート）、代わりに `@remotion/gif` の `<Gif>` を使えます。

```bash
npx remotion add @remotion/gif # npm プロジェクト
bunx remotion add @remotion/gif # bun プロジェクト
yarn remotion add @remotion/gif # yarn プロジェクト
pnpm exec remotion add @remotion/gif # pnpm プロジェクト
```

```tsx
import { Gif } from "@remotion/gif";
import { staticFile } from "remotion";

export const MyComposition = () => {
  return <Gif src={staticFile("animation.gif")} width={500} height={500} />;
};
```

`<Gif>` は `<AnimatedImage>` と同じ prop を持ちますが、GIF ファイルのみサポートします。
