---
name: assets
description: Remotion での静的アセットの扱い
metadata:
  tags: assets, staticFile, images, fonts, public
---

# Remotion でのアセット import

## public フォルダ

プロジェクトルートの `public/` フォルダにアセットを置きます。

## 利用: staticFile()

`public/` フォルダのファイルを参照するときは **必ず** `staticFile()` を使います:

```tsx
import { Img, staticFile } from "remotion";

export const MyComposition = () => {
  return <Img src={staticFile("logo.png")} />;
};
```

この関数は、サブディレクトリへ deploy しても正しく動く encoded URL を返します。

## 利用: コンポーネントとの組み合わせ

**画像:**

```tsx
import { Img, staticFile } from "remotion";

<Img src={staticFile("photo.png")} />;
```

**動画:**

```tsx
import { Video } from "@remotion/media";
import { staticFile } from "remotion";

<Video src={staticFile("clip.mp4")} />;
```

**音声:**

```tsx
import { Audio } from "@remotion/media";
import { staticFile } from "remotion";

<Audio src={staticFile("music.mp3")} />;
```

**フォント:**

```tsx
import { staticFile } from "remotion";

const fontFamily = new FontFace("MyFont", `url(${staticFile("font.woff2")})`);
await fontFamily.load();
document.fonts.add(fontFamily);
```

## リモート URL

リモート URL は `staticFile()` なしで直接使えます:

```tsx
<Img src="https://example.com/image.png" />
<Video src="https://remotion.media/video.mp4" />
```

## 重要な注意点

- Remotion コンポーネント（`<Img>`、`<Video>`、`<Audio>`）は、render 前にアセットが完全に読み込まれることを保証します
- ファイル名の特殊文字（`#`、`?`、`&`）は自動的に encode されます
