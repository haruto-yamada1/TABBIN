---
name: images
description: Remotion での画像の埋め込み
metadata:
  tags: images, img, staticFile, png, jpg, svg, webp
---

# Remotion での画像利用

## `<Img>` コンポーネント

画像表示には **常に** `remotion` の `<Img>` を使います:

```tsx
import { Img, staticFile } from "remotion";

export const MyComposition = () => {
  return <Img src={staticFile("photo.png")} />;
};
```

## 重要な制約

**`remotion` の `<Img>` を使う必要があります。** 次は使わないでください:

- ネイティブ HTML `<img>`
- Next.js `<Image>`
- CSS `background-image`

`<Img>` は render 前に画像が完全読み込みされることを保証し、export 時のちらつきや空白フレームを防ぎます。

## staticFile() でローカル画像

`public/` に画像を置き、`staticFile()` で参照します:

```
my-video/
├─ public/
│  ├─ logo.png
│  ├─ avatar.jpg
│  └─ icon.svg
├─ src/
├─ package.json
```

```tsx
import { Img, staticFile } from "remotion";

<Img src={staticFile("logo.png")} />;
```

## リモート画像

リモート URL は `staticFile()` なしで直接使えます:

```tsx
<Img src="https://example.com/image.png" />
```

リモート画像は CORS が有効である必要があります。

アニメーション GIF には `@remotion/gif` の `<Gif>` を使います。

## サイズと配置

サイズと位置は `style` prop で制御します:

```tsx
<Img
  src={staticFile("photo.png")}
  style={{
    width: 500,
    height: 300,
    position: "absolute",
    top: 100,
    left: 50,
    objectFit: "cover",
  }}
/>
```

## 動的な画像パス

動的参照には template literal を使います:

```tsx
import { Img, staticFile, useCurrentFrame } from "remotion";

const frame = useCurrentFrame();

// 画像シーケンス
<Img src={staticFile(`frames/frame${frame}.png`)} />

// props に基づく選択
<Img src={staticFile(`avatars/${props.userId}.png`)} />

// 条件付き画像
<Img src={staticFile(`icons/${isActive ? "active" : "inactive"}.svg`)} />
```

次の用途に便利です:

- 画像シーケンス（フレーム単位アニメーション）
- ユーザー固有のアバター / プロフィール画像
- テーマ別アイコン
- 状態依存グラフィック

## 画像 dimensions の取得

`getImageDimensions()` で画像サイズを取得できます:

```tsx
import { getImageDimensions, staticFile } from "remotion";

const { width, height } = await getImageDimensions(staticFile("photo.png"));
```

アスペクト比や composition サイズ計算に便利です:

```tsx
import { getImageDimensions, staticFile, CalculateMetadataFunction } from "remotion";

const calculateMetadata: CalculateMetadataFunction = async () => {
  const { width, height } = await getImageDimensions(staticFile("photo.png"));
  return {
    width,
    height,
  };
};
```
