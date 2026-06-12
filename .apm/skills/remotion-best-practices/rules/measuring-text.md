---
name: measuring-text
description: テキスト寸法の計測、コンテナへのフィット、オーバーフロー確認
metadata:
  tags: measure, text, layout, dimensions, fitText, fillTextBox
---

# Remotion でのテキスト計測

## 前提条件

未インストールなら `@remotion/layout-utils` をインストール:

```bash
npx remotion add @remotion/layout-utils
```

## テキスト寸法の計測

`measureText()` でテキストの width / height を計算:

```tsx
import { measureText } from "@remotion/layout-utils";

const { width, height } = measureText({
  text: "Hello World",
  fontFamily: "Arial",
  fontSize: 32,
  fontWeight: "bold",
});
```

結果は cache されます。同じ呼び出しは cache を返します。

## 幅にテキストをフィット

`fitText()` でコンテナに最適な font size を求めます:

```tsx
import { fitText } from "@remotion/layout-utils";

const { fontSize } = fitText({
  text: "Hello World",
  withinWidth: 600,
  fontFamily: "Inter",
  fontWeight: "bold",
});

return (
  <div
    style={{
      fontSize: Math.min(fontSize, 80), // 80px で cap
      fontFamily: "Inter",
      fontWeight: "bold",
    }}
  >
    Hello World
  </div>
);
```

## テキストオーバーフローの確認

`fillTextBox()` でテキストが box を超えるか確認:

```tsx
import { fillTextBox } from "@remotion/layout-utils";

const box = fillTextBox({ maxBoxWidth: 400, maxLines: 3 });

const words = ["Hello", "World", "This", "is", "a", "test"];
for (const word of words) {
  const { exceedsBox } = box.add({
    text: word + " ",
    fontFamily: "Arial",
    fontSize: 24,
  });
  if (exceedsBox) {
    // オーバーフローするので適宜処理
    break;
  }
}
```

## ベストプラクティス

**先にフォントを読み込む:** 計測関数はフォント読み込み後にのみ呼び出してください。

```tsx
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily, waitUntilDone } = loadFont("normal", {
  weights: ["400"],
  subsets: ["latin"],
});

waitUntilDone().then(() => {
  // ここで計測して安全
  const { width } = measureText({
    text: "Hello",
    fontFamily,
    fontSize: 32,
  });
});
```

**validateFontIsLoaded を使う:** フォント読み込み問題を早期検出:

```tsx
measureText({
  text: "Hello",
  fontFamily: "MyCustomFont",
  fontSize: 32,
  validateFontIsLoaded: true, // 未読み込みなら throw
});
```

**font property を一致させる:** 計測と render で同じ property を使う:

```tsx
const fontStyle = {
  fontFamily: "Inter",
  fontSize: 32,
  fontWeight: "bold" as const,
  letterSpacing: "0.5px",
};

const { width } = measureText({
  text: "Hello",
  ...fontStyle,
});

return <div style={fontStyle}>Hello</div>;
```

**padding / border を避ける:** layout 差を防ぐため `border` の代わりに `outline` を使う:

```tsx
<div style={{ outline: "2px solid red" }}>Text</div>
```
