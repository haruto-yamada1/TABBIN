---
name: audio
description: Remotion でのオーディオの埋め込み
metadata:
  tags: audio, media, trim, volume, speed, loop, pitch, mute, sound, sfx
---

# Remotion でのオーディオ利用

## 前提条件

まず @remotion/media パッケージをインストールする必要があります。
未インストールの場合は次のコマンドを使用:

```bash
npx remotion add @remotion/media
```

## オーディオのインポート

composition にオーディオを追加するには `@remotion/media` の `<Audio>` を使用します。

```tsx
import { Audio } from "@remotion/media";
import { staticFile } from "remotion";

export const MyComposition = () => {
  return <Audio src={staticFile("audio.mp3")} />;
};
```

リモート URL もサポートされます:

```tsx
<Audio src="https://remotion.media/audio.mp3" />
```

デフォルトではオーディオは先頭からフル音量・フル長で再生されます。
複数の `<Audio>` コンポーネントでトラックを重ねられます。

## トリミング

オーディオの一部を削除するには `trimBefore` と `trimAfter` を使用します。値はフレーム単位です。

```tsx
const { fps } = useVideoConfig();

return (
  <Audio
    src={staticFile("audio.mp3")}
    trimBefore={2 * fps} // Skip the first 2 seconds
    trimAfter={10 * fps} // End at the 10 second mark
  />
);
```

オーディオは composition の先頭から再生開始しますが、指定した部分だけが再生されます。

## 遅延

開始を遅らせるにはオーディオを `<Sequence>` でラップします:

```tsx
import { Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";

const { fps } = useVideoConfig();

return (
  <Sequence from={1 * fps}>
    <Audio src={staticFile("audio.mp3")} />
  </Sequence>
);
```

オーディオは 1 秒後に再生を開始します。

## 音量

静的音量を設定（0 から 1）:

```tsx
<Audio src={staticFile("audio.mp3")} volume={0.5} />
```

または現在フレームに基づく動的音量にコールバックを使用:

```tsx
import { interpolate } from "remotion";

const { fps } = useVideoConfig();

return (
  <Audio
    src={staticFile("audio.mp3")}
    volume={(f) => interpolate(f, [0, 1 * fps], [0, 1], { extrapolateRight: "clamp" })}
  />
);
```

`f` の値は composition フレームではなく、オーディオ再生開始時に 0 から始まります。

## ミュート

オーディオを無音にするには `muted` を使用します。動的に設定可能です:

```tsx
const frame = useCurrentFrame();
const { fps } = useVideoConfig();

return (
  <Audio
    src={staticFile("audio.mp3")}
    muted={frame >= 2 * fps && frame <= 4 * fps} // Mute between 2s and 4s
  />
);
```

## 速度

再生速度を変えるには `playbackRate` を使用:

```tsx
<Audio src={staticFile("audio.mp3")} playbackRate={2} /> {/* 2x speed */}
<Audio src={staticFile("audio.mp3")} playbackRate={0.5} /> {/* Half speed */}
```

逆再生はサポートされていません。

## ループ

オーディオを無限ループするには `loop` を使用:

```tsx
<Audio src={staticFile("audio.mp3")} loop />
```

ループ時のフレームカウントの挙動は `loopVolumeCurveBehavior` で制御:

- `"repeat"`: Frame count resets to 0 each loop (default)
- `"extend"`: Frame count continues incrementing

```tsx
<Audio
  src={staticFile("audio.mp3")}
  loop
  loopVolumeCurveBehavior="extend"
  volume={(f) => interpolate(f, [0, 300], [1, 0])} // Fade out over multiple loops
/>
```

## ピッチ

速度に影響せずピッチを調整するには `toneFrequency` を使用。値は 0.01 から 2:

```tsx
<Audio
  src={staticFile("audio.mp3")}
  toneFrequency={1.5} // Higher pitch
/>
<Audio
  src={staticFile("audio.mp3")}
  toneFrequency={0.8} // Lower pitch
/>
```

ピッチシフトはサーバー側レンダリング時のみ有効で、Remotion Studio プレビューや `<Player />` では動作しません。
