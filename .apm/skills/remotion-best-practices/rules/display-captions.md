---
name: display-captions
description: Remotion でのキャプション表示
metadata:
  tags: captions, subtitles, display, tiktok, highlight
---

# Remotion でキャプションを表示

このガイドは、すでに [`Caption`](https://www.remotion.dev/docs/captions/caption) 形式のキャプションがある前提で、Remotion への表示方法を説明します。

## 前提条件

キャプション生成方法は [Transcribing audio](transcribe-captions.md) を参照してください。

[`@remotion/captions`](https://www.remotion.dev/docs/captions) パッケージを先にインストールします。
未インストールの場合は次のコマンドを使用:

```bash
npx remotion add @remotion/captions
```

## キャプションの取得

まずキャプション JSON を fetch します。読み込み完了まで render を保留するには [`useDelayRender()`](https://www.remotion.dev/docs/use-delay-render) を使います:

```tsx
import { useState, useEffect, useCallback } from "react";
import { AbsoluteFill, staticFile, useDelayRender } from "remotion";
import type { Caption } from "@remotion/captions";

export const MyComponent: React.FC = () => {
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender());

  const fetchCaptions = useCallback(async () => {
    try {
      // captions.json が public/ フォルダにある想定
      const response = await fetch(staticFile("captions123.json"));
      const data = await response.json();
      setCaptions(data);
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

  return <AbsoluteFill>{/* ここにキャプションを render */}</AbsoluteFill>;
};
```

## ページの作成

`createTikTokStyleCaptions()` でキャプションをページにグループ化します。`combineTokensWithinMilliseconds` で同時表示する語数を制御します:

```tsx
import { useMemo } from "react";
import { createTikTokStyleCaptions } from "@remotion/captions";
import type { Caption } from "@remotion/captions";

// キャプション切り替え間隔（ミリ秒）
// 大きい値 = 1 ページあたりの語数が増える
// 小さい値 = 語数が減る（より word-by-word）
const SWITCH_CAPTIONS_EVERY_MS = 1200;

const { pages } = useMemo(() => {
  return createTikTokStyleCaptions({
    captions,
    combineTokensWithinMilliseconds: SWITCH_CAPTIONS_EVERY_MS,
  });
}, [captions]);
```

## Sequence で render

各ページを `<Sequence>` で render します。開始フレームと duration はページのタイミングから計算します:

```tsx
import { Sequence, useVideoConfig, AbsoluteFill } from "remotion";
import type { TikTokPage } from "@remotion/captions";

const CaptionedContent: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
      {pages.map((page, index) => {
        const nextPage = pages[index + 1] ?? null;
        const startFrame = (page.startMs / 1000) * fps;
        const endFrame = Math.min(
          nextPage ? (nextPage.startMs / 1000) * fps : Infinity,
          startFrame + (SWITCH_CAPTIONS_EVERY_MS / 1000) * fps,
        );
        const durationInFrames = endFrame - startFrame;

        if (durationInFrames <= 0) {
          return null;
        }

        return (
          <Sequence key={index} from={startFrame} durationInFrames={durationInFrames}>
            <CaptionPage page={page} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
```

## 空白の保持

キャプションは空白に sensitive です。各語の前に `text` フィールドへ空白を含めてください。`whiteSpace: "pre"` で空白を保持します。

## キャプション用の別コンポーネント

キャプション logic は別コンポーネントに分離してください。  
専用ファイルを新規作成します。

## 語のハイライト

caption page には `tokens` があり、現在発話中の語をハイライトできます:

```tsx
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { TikTokPage } from "@remotion/captions";

const HIGHLIGHT_COLOR = "#39E508";

const CaptionPage: React.FC<{ page: TikTokPage }> = ({ page }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Sequence 開始からの相対時間
  const currentTimeMs = (frame / fps) * 1000;
  // ページ開始を加えて絶対時間に変換
  const absoluteTimeMs = page.startMs + currentTimeMs;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ fontSize: 80, fontWeight: "bold", whiteSpace: "pre" }}>
        {page.tokens.map((token) => {
          const isActive = token.fromMs <= absoluteTimeMs && token.toMs > absoluteTimeMs;

          return (
            <span key={token.fromMs} style={{ color: isActive ? HIGHLIGHT_COLOR : "white" }}>
              {token.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
```

## 動画コンテンツと並べてキャプションを表示

既定では、キャプションを動画コンテンツと並べて同期表示します。  
動画ごとに新しい captions JSON ファイルを用意してください。

```tsx
<AbsoluteFill>
  <Video src={staticFile("video.mp4")} />
  <CaptionPage page={page} />
</AbsoluteFill>
```
