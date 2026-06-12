---
name: ffmpeg
description: Remotion での FFmpeg 利用
metadata:
  tags: ffmpeg, ffprobe, video, trimming
---

## Remotion での FFmpeg

`ffmpeg` と `ffprobe` の個別インストールは不要です。`bunx remotion ffmpeg` と `bunx remotion ffprobe` 経由で利用できます:

```bash
bunx remotion ffmpeg -i input.mp4 output.mp3
bunx remotion ffprobe input.mp4
```

### 動画のトリミング

動画トリミングには 2 つの方法があります:

1. FFMpeg コマンドラインを使う。動画先頭のフリーズフレームを避けるため、**必ず** 再 encode してください。

```bash
# 正確なフレームから再 encode
bunx remotion ffmpeg -ss 00:00:05 -i public/input.mp4 -to 00:00:10 -c:v libx264 -c:a aac public/output.mp4
```

2. `<Video>` の `trimBefore` / `trimAfter` prop を使う。非破壊で、いつでも trim を変更できます。

```tsx
import { Video } from "@remotion/media";

<Video src={staticFile("video.mp4")} trimBefore={5 * fps} trimAfter={10 * fps} />;
```
