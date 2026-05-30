---
name: get-audio-duration
description: オーディオの長さを取得
metadata:
  tags: duration, audio, length, time, seconds, mp3, wav
---

# Mediabunny でオーディオの長さを取得

Mediabunny はオーディオファイルの duration を抽出できます。browser、Node.js、Bun で動作します。

## オーディオの長さを取得

```tsx title="get-audio-duration.ts"
import { Input, ALL_FORMATS, UrlSource } from "mediabunny";

export const getAudioDuration = async (src: string) => {
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
const duration = await getAudioDuration("https://remotion.media/audio.mp3");
console.log(duration); // 例: 180.5（秒）
```

## 利用: Remotion で staticFile と組み合わせる

ファイルパスは `staticFile()` で包みます:

```tsx
import { staticFile } from "remotion";

const duration = await getAudioDuration(staticFile("audio.mp3"));
```

## Node.js と Bun では

`UrlSource` の代わりに `FileSource` を使います:

```tsx
import { Input, ALL_FORMATS, FileSource } from "mediabunny";

const input = new Input({
  formats: ALL_FORMATS,
  source: new FileSource(file), // input や drag-drop からの File オブジェクト
});
```
