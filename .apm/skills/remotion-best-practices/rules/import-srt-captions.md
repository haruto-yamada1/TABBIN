---
name: import-srt-captions
description: SRT キャプションのインポート
metadata:
  tags: captions, subtitles, srt, import, parse
---

# Remotion への .srt 字幕 import

既存の `.srt` 字幕ファイルがある場合、`@remotion/captions` の `parseSrt()` で Remotion に import できます。

.srt がない場合は [Transcribing audio](transcribe-captions.md) でキャプション生成方法を参照してください。

## 前提条件

`@remotion/captions` パッケージを先にインストールします。
未インストールの場合は次のコマンドを使用:

```bash
npx remotion add @remotion/captions # npm プロジェクト
bunx remotion add @remotion/captions # bun プロジェクト
yarn remotion add @remotion/captions # yarn プロジェクト
pnpm exec remotion add @remotion/captions # pnpm プロジェクト
```

## .srt ファイルの読み込み

`public` フォルダの `.srt` を `staticFile()` で参照し、fetch して parse します:

```tsx
import { useState, useEffect, useCallback } from "react";
import { AbsoluteFill, staticFile, useDelayRender } from "remotion";
import { parseSrt } from "@remotion/captions";
import type { Caption } from "@remotion/captions";

export const MyComponent: React.FC = () => {
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender());

  const fetchCaptions = useCallback(async () => {
    try {
      const response = await fetch(staticFile("subtitles.srt"));
      const text = await response.text();
      const { captions: parsed } = parseSrt({ input: text });
      setCaptions(parsed);
      continueRender(handle);
    } catch (e) {
      cancelRender(e);
    }
  }, [continueRender, cancelRender, handle]);

  useEffect(() => {
    fetchCaptions();
  }, [fetchCaptions]);

  if (!captions) {
    return null;
  }

  return <AbsoluteFill>{/* ここで captions を利用 */}</AbsoluteFill>;
};
```

リモート URL もサポートされます。`staticFile()` の代わりに URL 経由で `fetch()` できます。

## 利用: import した captions

parse 後は `Caption` 形式になり、`@remotion/captions` のすべての utility と組み合わせられます。
