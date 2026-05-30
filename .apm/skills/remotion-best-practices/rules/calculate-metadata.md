---
name: calculate-metadata
description: calculateMetadata による動的メタデータ
metadata:
  tags: calculateMetadata, duration, dimensions, props, dynamic
---

# calculateMetadata の利用

`<Composition>` の `calculateMetadata` で、render 前に duration、dimensions、props を動的に設定します。

```tsx
<Composition
  id="MyComp"
  component={MyComponent}
  durationInFrames={300}
  fps={30}
  width={1920}
  height={1080}
  defaultProps={{ videoSrc: "https://remotion.media/video.mp4" }}
  calculateMetadata={calculateMetadata}
/>
```

## 動画に基づいて duration を設定

動画の duration と dimensions を取得するには [`getVideoDuration`](./get-video-duration.md) と [`getVideoDimensions`](./get-video-dimensions.md) skill を参照してください:

```tsx
import { CalculateMetadataFunction } from "remotion";
import { getVideoDuration } from "./get-video-duration";

const calculateMetadata: CalculateMetadataFunction<Props> = async ({ props }) => {
  const durationInSeconds = await getVideoDuration(props.videoSrc);

  return {
    durationInFrames: Math.ceil(durationInSeconds * 30),
  };
};
```

## 動画の dimensions に合わせる

dimensions 取得には [`getVideoDimensions`](./get-video-dimensions.md) skill を使います:

```tsx
import { CalculateMetadataFunction } from "remotion";
import { getVideoDuration } from "./get-video-duration";
import { getVideoDimensions } from "./get-video-dimensions";

const calculateMetadata: CalculateMetadataFunction<Props> = async ({ props }) => {
  const dimensions = await getVideoDimensions(props.videoSrc);

  return {
    width: dimensions.width,
    height: dimensions.height,
  };
};
```

## 複数動画に基づいて duration を設定

```tsx
const calculateMetadata: CalculateMetadataFunction<Props> = async ({ props }) => {
  const metadataPromises = props.videos.map((video) => getVideoDuration(video.src));
  const allMetadata = await Promise.all(metadataPromises);

  const totalDuration = allMetadata.reduce((sum, durationInSeconds) => sum + durationInSeconds, 0);

  return {
    durationInFrames: Math.ceil(totalDuration * 30),
  };
};
```

## 既定の outName を設定

props に基づいて既定の出力ファイル名を設定します:

```tsx
const calculateMetadata: CalculateMetadataFunction<Props> = async ({ props }) => {
  return {
    defaultOutName: `video-${props.id}.mp4`,
  };
};
```

## props の変換

render 前にデータを fetch したり props を変換します:

```tsx
const calculateMetadata: CalculateMetadataFunction<Props> = async ({ props, abortSignal }) => {
  const response = await fetch(props.dataUrl, { signal: abortSignal });
  const data = await response.json();

  return {
    props: {
      ...props,
      fetchedData: data,
    },
  };
};
```

Studio で props が変わったとき、古い request は `abortSignal` でキャンセルされます。

## 戻り値

すべてのフィールドは任意です。返した値は `<Composition>` の props を上書きします:

- `durationInFrames`: フレーム数
- `width`: composition の幅（ピクセル）
- `height`: composition の高さ（ピクセル）
- `fps`: 1 秒あたりのフレーム数
- `props`: コンポーネントへ渡す変換後 props
- `defaultOutName`: 既定の出力ファイル名
- `defaultCodec`: render の既定 codec
