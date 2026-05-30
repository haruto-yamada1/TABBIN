---
name: get-video-duration
description: 動画の長さを取得
metadata:
  tags: duration, video, length, time, seconds
---

# Mediabunny で動画の長さを取得

Mediabunny は動画ファイルの duration を抽出できます。browser、Node.js、Bun で動作します。

## 動画の長さを取得

```tsx
import { Input, ALL_FORMATS, UrlSource } from "mediabunny";

export const getVideoDuration = async (src: string) => {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new UrlSource(src, {
      getRetryDelay: () => null,
    }),
  });

  const durationInSeconds = await input.computeDuration();
  return durationInSeconds;
};
```

## 使い方

```tsx
const duration = await getVideoDuration("https://remotion.media/video.mp4");
console.log(duration); // 例: 10.5（秒）
```

## public/ ディレクトリの動画ファイル

ファイルパスは `staticFile()` で包みます:

```tsx
import { staticFile } from "remotion";

const duration = await getVideoDuration(staticFile("video.mp4"));
```

## Node.js と Bun では

`UrlSource` の代わりに `FileSource` を使います:

```tsx
import { Input, ALL_FORMATS, FileSource } from "mediabunny";

const input = new Input({
  formats: ALL_FORMATS,
  source: new FileSource(file), // input や drag-drop からの File オブジェクト
});

const durationInSeconds = await input.computeDuration();
```
