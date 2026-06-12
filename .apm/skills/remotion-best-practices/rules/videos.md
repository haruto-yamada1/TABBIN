---
name: videos
description: Remotion での動画埋め込み — トリム、音量、速度、ループ、ピッチ
metadata:
  tags: video, media, trim, volume, speed, loop, pitch
---
# Remotion での動画利用

## 前提条件

まず @remotion/media パッケージをインストールする必要があります。  
未インストールの場合は次のコマンドを使用:

```bash
npx remotion add @remotion/media # If project uses npm
bunx remotion add @remotion/media # If project uses bun
yarn remotion add @remotion/media # If project uses yarn
pnpm exec remotion add @remotion/media # If project uses pnpm
```

composition に動画を埋め込むには `@remotion/media` の `<Video>` を使用します。

```tsx
import { Video } from "@remotion/media";
import { staticFile } from "remotion";

export const MyComposition = () => {
  return <Video src={staticFile("video.mp4")} />;
};
```

リモート URL もサポートされます:

```tsx
<Video src="https://remotion.media/video.mp4" />
```

## トリミング

`trimBefore` と `trimAfter` で動画の一部を削除します。値は秒単位です。

```tsx
const { fps } = useVideoConfig();

return (
  <Video
    src={staticFile("video.mp4")}
    trimBefore={2 * fps} // Skip the first 2 seconds
    trimAfter={10 * fps} // End at the 10 second mark
  />
);
```

## 遅延

動画の表示タイミングを遅らせるには `<Sequence>` でラップします:

```tsx
import { Sequence, staticFile } from "remotion";
import { Video } from "@remotion/media";

const { fps } = useVideoConfig();

return (
  <Sequence from={1 * fps}>
    <Video src={staticFile("video.mp4")} />
  </Sequence>
);
```

video will appear after 1 second。

## サイズと位置

サイズと位置は `style` prop で制御します:

```tsx
<Video
  src={staticFile("video.mp4")}
  style={{
    width: 500,
    height: 300,
    position: "absolute",
    top: 100,
    left: 50,
    objectFit: "cover",
  }}
/>
```

## 音量

設定: static volume (0 to 1):

```tsx
<Video src={staticFile("video.mp4")} volume={0.5} />
```

または現在フレームに基づく動的音量にコールバックを使用:

```tsx
import { interpolate } from "remotion";

const { fps } = useVideoConfig();

return (
  <Video
    src={staticFile("video.mp4")}
    volume={(f) => interpolate(f, [0, 1 * fps], [0, 1], { extrapolateRight: "clamp" })}
  />
);
```

動画を完全に無音にするには `muted` を使用:

```tsx
<Video src={staticFile("video.mp4")} muted />
```

## 速度

再生速度を変えるには `playbackRate` を使用:

```tsx
<Video src={staticFile("video.mp4")} playbackRate={2} /> {/* 2x speed */}
<Video src={staticFile("video.mp4")} playbackRate={0.5} /> {/* Half speed */}
```

逆再生はサポートされていません。

## ループ

動画を無限ループするには `loop` を使用:

```tsx
<Video src={staticFile("video.mp4")} loop />
```

Use `loopVolumeCurveBehavior` to control how the frame count behaves when looping:

- `"repeat"`: Frame count resets to 0 each loop (for `volume` callback)
- `"extend"`: Frame count continues incrementing

```tsx
<Video
  src={staticFile("video.mp4")}
  loop
  loopVolumeCurveBehavior="extend"
  volume={(f) => interpolate(f, [0, 300], [1, 0])} // Fade out over multiple loops
/>
```

## ピッチ

速度に影響せずピッチを調整するには `toneFrequency` を使用。値は 0.01 から 2:

```tsx
<Video
  src={staticFile("video.mp4")}
  toneFrequency={1.5} // Higher pitch
/>
<Video
  src={staticFile("video.mp4")}
  toneFrequency={0.8} // Lower pitch
/>
```

ピッチシフトはサーバー側レンダリング時のみ有効で、Remotion Studio プレビューや `<Player />` では動作しません。
