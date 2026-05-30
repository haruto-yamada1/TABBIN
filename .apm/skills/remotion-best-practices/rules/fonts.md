---
name: fonts
description: Remotion でのフォント読み込み
metadata:
  tags: fonts, google-fonts, typography, text
---

# Remotion でのフォント利用

## @remotion/google-fonts で Google Fonts

Google Fonts 利用の推奨方法です。型安全で、フォント準備完了まで render を自動ブロックします。

### 前提条件

`@remotion/google-fonts` パッケージを先にインストールします。
未インストールの場合は次のコマンドを使用:

```bash
npx remotion add @remotion/google-fonts # npm プロジェクト
bunx remotion add @remotion/google-fonts # bun プロジェクト
yarn remotion add @remotion/google-fonts # yarn プロジェクト
pnpm exec remotion add @remotion/google-fonts # pnpm プロジェクト
```

```tsx
import { loadFont } from "@remotion/google-fonts/Lobster";

const { fontFamily } = loadFont();

export const MyComposition = () => {
  return <div style={{ fontFamily }}>Hello World</div>;
};
```

可能なら必要な weight / subset のみ指定し、ファイルサイズを抑えます:

```tsx
import { loadFont } from "@remotion/google-fonts/Roboto";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
});
```

### フォント読み込み完了を待つ

準備完了を知る必要がある場合は `waitUntilDone()` を使います:

```tsx
import { loadFont } from "@remotion/google-fonts/Lobster";

const { fontFamily, waitUntilDone } = loadFont();

await waitUntilDone();
```

## @remotion/fonts でローカルフォント

ローカルフォントファイルには `@remotion/fonts` を使います。

### 前提条件

まず `@remotion/fonts` をインストール:

```bash
npx remotion add @remotion/fonts # npm プロジェクト
bunx remotion add @remotion/fonts # bun プロジェクト
yarn remotion add @remotion/fonts # yarn プロジェクト
pnpm exec remotion add @remotion/fonts # pnpm プロジェクト
```

### ローカルフォントの読み込み

フォントファイルを `public/` に置き、`loadFont()` を使います:

```tsx
import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

await loadFont({
  family: "MyFont",
  url: staticFile("MyFont-Regular.woff2"),
});

export const MyComposition = () => {
  return <div style={{ fontFamily: "MyFont" }}>Hello World</div>;
};
```

### 複数 weight の読み込み

同じ family 名で weight ごとに読み込みます:

```tsx
import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

await Promise.all([
  loadFont({
    family: "Inter",
    url: staticFile("Inter-Regular.woff2"),
    weight: "400",
  }),
  loadFont({
    family: "Inter",
    url: staticFile("Inter-Bold.woff2"),
    weight: "700",
  }),
]);
```

### 利用可能な option

```tsx
loadFont({
  family: "MyFont", // 必須: CSS で使う名前
  url: staticFile("font.woff2"), // 必須: フォントファイル URL
  format: "woff2", // 任意: 拡張子から自動検出
  weight: "400", // 任意: font weight
  style: "normal", // 任意: normal または italic
  display: "block", // 任意: font-display 挙動
});
```

## 利用: コンポーネント内

`loadFont()` はコンポーネント先頭、または早い段階で import する別ファイルで呼びます:

```tsx
import { loadFont } from "@remotion/google-fonts/Montserrat";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
});

export const Title: React.FC<{ text: string }> = ({ text }) => {
  return (
    <h1
      style={{
        fontFamily,
        fontSize: 80,
        fontWeight: "bold",
      }}
    >
      {text}
    </h1>
  );
};
```
