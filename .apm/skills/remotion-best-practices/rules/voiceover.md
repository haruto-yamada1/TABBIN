---
name: voiceover
description: ElevenLabs TTS で AI ナレーションを追加
metadata:
  tags: voiceover, audio, elevenlabs, tts, speech, calculateMetadata, dynamic duration
---

# Remotion composition への AI ナレーション追加

ElevenLabs TTS でシーンごとに音声を生成し、[`calculateMetadata`](./calculate-metadata) で composition の長さをオーディオに合わせて動的に調整します。

## 前提条件

**ElevenLabs API キー**が必要です。プロジェクトルートの `.env` に保存します:

```
ELEVENLABS_API_KEY=your_key_here
```

`.env` がない、または `ELEVENLABS_API_KEY` が未設定の場合、ユーザーに ElevenLabs API キーを **必ず** 確認してください。他 TTS ツールへの **フォールバック禁止** です。

生成スクリプト実行時は `--env-file` フラグで `.env` を読み込みます:

```bash
node --env-file=.env --strip-types generate-voiceover.ts
```

## ElevenLabs でオーディオ生成

設定を読み、各シーンで ElevenLabs API を呼び、`public/` に MP3 を書き出すスクリプトを作成します。Remotion は `staticFile()` でアクセスできます。

1 シーン向けのコア API 呼び出し:

```ts title="generate-voiceover.ts"
const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
  method: "POST",
  headers: {
    "xi-api-key": process.env.ELEVENLABS_API_KEY!,
    "Content-Type": "application/json",
    Accept: "audio/mpeg",
  },
  body: JSON.stringify({
    text: "Welcome to the show.",
    model_id: "eleven_multilingual_v2",
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.3,
    },
  }),
});

const audioBuffer = Buffer.from(await response.arrayBuffer());
writeFileSync(`public/voiceover/${compositionId}/${scene.id}.mp3`, audioBuffer);
```

## calculateMetadata による動的 composition 期間

[オーディオの長さ](./get-audio-duration.md)を計測し composition の長さを設定するには [`calculateMetadata`](./calculate-metadata.md) を使用します。

```tsx
import { CalculateMetadataFunction, staticFile } from "remotion";
import { getAudioDuration } from "./get-audio-duration";

const FPS = 30;

const SCENE_AUDIO_FILES = [
  "voiceover/my-comp/scene-01-intro.mp3",
  "voiceover/my-comp/scene-02-main.mp3",
  "voiceover/my-comp/scene-03-outro.mp3",
];

export const calculateMetadata: CalculateMetadataFunction<Props> = async ({ props }) => {
  const durations = await Promise.all(
    SCENE_AUDIO_FILES.map((file) => getAudioDuration(staticFile(file))),
  );

  const sceneDurations = durations.map((durationInSeconds) => {
    return durationInSeconds * FPS;
  });

  return {
    durationInFrames: Math.ceil(sceneDurations.reduce((sum, d) => sum + d, 0)),
  };
};
```

計算した `sceneDurations` は `voiceover` prop 経由でコンポーネントに渡し、各シーンの長さをコンポーネントが把握できるようにします。

composition が [`<TransitionSeries>`](./transitions.md) を使う場合、合計 duration からオーバーラップを差し引きます: [./transitions.md#calculating-total-composition-duration](./transitions.md#calculating-total-composition-duration)

## コンポーネント内でのオーディオレンダリング

コンポーネント内でのオーディオレンダリングの詳細は [audio.md](./audio.md) を参照してください。

## オーディオ開始の遅延

オーディオ開始の遅延の詳細は [audio.md#delaying](./audio.md#delaying) を参照してください。
