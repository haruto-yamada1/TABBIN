---
name: subtitles
description: 字幕とキャプションのルール
metadata:
  tags: subtitles, captions, remotion, json
---

すべてのキャプションは JSON で処理する必要があります。キャプションは次の `Caption` 型を使います:

```ts
import type { Caption } from "@remotion/captions";
```

型定義:

```ts
type Caption = {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs: number | null;
  confidence: number | null;
};
```

## キャプション生成

動画・音声からキャプションを生成する手順は [./transcribe-captions.md](./transcribe-captions.md) を参照してください。

## キャプション表示

動画へのキャプション表示は [./display-captions.md](./display-captions.md) を参照してください。

## キャプション import

.srt からの import は [./import-srt-captions.md](./import-srt-captions.md) を参照してください。
