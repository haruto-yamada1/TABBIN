---
name: get-video-dimensions
description: 動画の寸法を取得
metadata:
  tags: dimensions, width, height, resolution, size, video
---

# Mediabunny で動画の dimensions を取得

Mediabunny は動画ファイルの width / height を抽出できます。browser、Node.js、Bun で動作します。

## 動画の dimensions を取得

```tsx
import { Input, ALL_FORMATS, UrlSource } from "mediabunny";

export const getVideoDimensions = async (src: string) => {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new UrlSource(src, {
      getRetryDelay: () => null,
    }),
  });

  const videoTrack = await input.getPrimaryVideoTrack();
  if (!videoTrack) {
    throw new Error("No video track found");
  }

  return {
    width: videoTrack.displayWidth,
    height: videoTrack.displayHeight,
  };
};
```

## 使い方

```tsx
const dimensions = await getVideoDimensions("https://remotion.media/video.mp4");
console.log(dimensions.width); // 例: 1920
console.log(dimensions.height); // 例: 1080
```

## 利用: ローカルファイル

ローカルファイルでは `UrlSource` の代わりに `FileSource` を使います:

```tsx
import { Input, ALL_FORMATS, FileSource } from "mediabunny";

const input = new Input({
  formats: ALL_FORMATS,
  source: new FileSource(file), // input や drag-drop からの File オブジェクト
});

const videoTrack = await input.getPrimaryVideoTrack();
const width = videoTrack.displayWidth;
const height = videoTrack.displayHeight;
```

## 利用: Remotion で staticFile と組み合わせる

```tsx
import { staticFile } from "remotion";

const dimensions = await getVideoDimensions(staticFile("video.mp4"));
```
