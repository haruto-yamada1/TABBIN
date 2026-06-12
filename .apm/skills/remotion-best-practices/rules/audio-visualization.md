---
name: audio-visualization
description: Remotion でのオーディオ可視化
metadata:
  tags: audio, visualization, spectrum, waveform, bass, music, audiogram, frequency
---

# Remotion でのオーディオ可視化

## 前提条件

```bash
npx remotion add @remotion/media-utils
```

## オーディオデータの読み込み

`useWindowedAudioData()` (https://www.remotion.dev/docs/use-windowed-audio-data) でオーディオデータを読み込み:

```tsx
import { useWindowedAudioData } from "@remotion/media-utils";
import { staticFile, useCurrentFrame, useVideoConfig } from "remotion";

const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const { audioData, dataOffsetInSeconds } = useWindowedAudioData({
  src: staticFile("podcast.wav"),
  frame,
  fps,
  windowInSeconds: 30,
});
```

## スペクトラムバー可視化

棒グラフ用の周波数データには `visualizeAudio()` (https://www.remotion.dev/docs/visualize-audio) を使います:

```tsx
import { useWindowedAudioData, visualizeAudio } from "@remotion/media-utils";
import { staticFile, useCurrentFrame, useVideoConfig } from "remotion";

const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const { audioData, dataOffsetInSeconds } = useWindowedAudioData({
  src: staticFile("music.mp3"),
  frame,
  fps,
  windowInSeconds: 30,
});

if (!audioData) {
  return null;
}

const frequencies = visualizeAudio({
  fps,
  frame,
  audioData,
  numberOfSamples: 256,
  optimizeFor: "speed",
  dataOffsetInSeconds,
});

return (
  <div style={{ display: "flex", alignItems: "flex-end", height: 200 }}>
    {frequencies.map((v, i) => (
      <div
        key={i}
        style={{
          flex: 1,
          height: `${v * 100}%`,
          backgroundColor: "#0b84f3",
          margin: "0 1px",
        }}
      />
    ))}
  </div>
);
```

- `numberOfSamples` は 2 の累乗（32, 64, 128, 256, 512, 1024）
- 値は 0-1。配列左 = bass、右 = 高域
- Lambda や高 sample 数では `optimizeFor: "speed"` を使う

**重要:** `audioData` を子コンポーネントへ渡すときは、親の `frame` も渡してください。各子で `useCurrentFrame()` を呼ぶと、offset 付き `<Sequence>` 内で可視化が不連続になります。

## 波形可視化

オシロスコープ風表示には `visualizeAudioWaveform()` (https://www.remotion.dev/docs/media-utils/visualize-audio-waveform) と `createSmoothSvgPath()` (https://www.remotion.dev/docs/media-utils/create-smooth-svg-path) を使います:

```tsx
import {
  createSmoothSvgPath,
  useWindowedAudioData,
  visualizeAudioWaveform,
} from "@remotion/media-utils";
import { staticFile, useCurrentFrame, useVideoConfig } from "remotion";

const frame = useCurrentFrame();
const { width, fps } = useVideoConfig();
const HEIGHT = 200;

const { audioData, dataOffsetInSeconds } = useWindowedAudioData({
  src: staticFile("voice.wav"),
  frame,
  fps,
  windowInSeconds: 30,
});

if (!audioData) {
  return null;
}

const waveform = visualizeAudioWaveform({
  fps,
  frame,
  audioData,
  numberOfSamples: 256,
  windowInSeconds: 0.5,
  dataOffsetInSeconds,
});

const path = createSmoothSvgPath({
  points: waveform.map((y, i) => ({
    x: (i / (waveform.length - 1)) * width,
    y: HEIGHT / 2 + (y * HEIGHT) / 2,
  })),
});

return (
  <svg width={width} height={HEIGHT}>
    <path d={path} fill="none" stroke="#0b84f3" strokeWidth={2} />
  </svg>
);
```

## bass 反応エフェクト

低域を抽出して beat 反応アニメーションに使います:

```tsx
const frequencies = visualizeAudio({
  fps,
  frame,
  audioData,
  numberOfSamples: 128,
  optimizeFor: "speed",
  dataOffsetInSeconds,
});

const lowFrequencies = frequencies.slice(0, 32);
const bassIntensity = lowFrequencies.reduce((sum, v) => sum + v, 0) / lowFrequencies.length;

const scale = 1 + bassIntensity * 0.5;
const opacity = Math.min(0.6, bassIntensity * 0.8);
```

## 音量ベース波形

周波数スペクトラムではなく簡略化した音量データが必要な場合は `getWaveformPortion()` (https://www.remotion.dev/docs/get-waveform-portion) を使います:

```tsx
import { getWaveformPortion } from "@remotion/media-utils";
import { useCurrentFrame, useVideoConfig } from "remotion";

const frame = useCurrentFrame();
const { fps } = useVideoConfig();
const currentTimeInSeconds = frame / fps;

const waveform = getWaveformPortion({
  audioData,
  startTimeInSeconds: currentTimeInSeconds,
  durationInSeconds: 5,
  numberOfSamples: 50,
});

// { index, amplitude } の配列（amplitude: 0-1）
waveform.map((bar) => <div key={bar.index} style={{ height: bar.amplitude * 100 }} />);
```

## 後処理

低域が自然に支配的になります。視覚バランスのため対数スケーリングを適用:

```tsx
const minDb = -100;
const maxDb = -30;

const scaled = frequencies.map((value) => {
  const db = 20 * Math.log10(value);
  return (db - minDb) / (maxDb - minDb);
});
```
