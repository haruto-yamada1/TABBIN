---
name: transcribe-captions
description: オーディオの文字起こしでキャプション生成
metadata:
  tags: captions, transcribe, whisper, audio, speech-to-text
---

# オーディオの文字起こし

Remotion でキャプション生成するには、[`@remotion/install-whisper-cpp`](https://www.remotion.dev/docs/install-whisper-cpp) の [`transcribe()`](https://www.remotion.dev/docs/install-whisper-cpp/transcribe) を使います。

## 前提条件

`@remotion/install-whisper-cpp` パッケージを先にインストールします。
未インストールの場合は次のコマンドを使用:

```bash
npx remotion add @remotion/install-whisper-cpp
```

## 文字起こし

Whisper.cpp と model を download し、オーディオを文字起こしする Node.js スクリプトを作成します。

```ts
import path from "path";
import {
  downloadWhisperModel,
  installWhisperCpp,
  transcribe,
  toCaptions,
} from "@remotion/install-whisper-cpp";
import fs from "fs";

const to = path.join(process.cwd(), "whisper.cpp");

await installWhisperCpp({
  to,
  version: "1.5.5",
});

await downloadWhisperModel({
  model: "medium.en",
  folder: to,
});

// 必要なら先に 16KHz wav に変換:
// import {execSync} from 'child_process';
// execSync('ffmpeg -i /path/to/audio.mp4 -ar 16000 /path/to/audio.wav -y');

const whisperCppOutput = await transcribe({
  model: "medium.en",
  whisperPath: to,
  whisperCppVersion: "1.5.5",
  inputPath: "/path/to/audio123.wav",
  tokenLevelTimestamps: true,
});

// 任意: 推奨 postprocessing を適用
const { captions } = toCaptions({
  whisperCppOutput,
});

// Remotion から fetch できるよう public/ に書き出し
fs.writeFileSync("captions123.json", JSON.stringify(captions, null, 2));
```

クリップごとに文字起こしし、複数 JSON を作成します。

Remotion での表示は [Displaying captions](display-captions.md) を参照してください。
