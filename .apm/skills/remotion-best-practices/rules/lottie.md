---
name: lottie
description: Remotion での Lottie アニメーション埋め込み
metadata:
  category: Animation
---

# Remotion で Lottie アニメーションを使う

## 前提条件

`@remotion/lottie` パッケージを先にインストールします。  
未インストールの場合は次のコマンドを使用:

```bash
npx remotion add @remotion/lottie # npm プロジェクト
bunx remotion add @remotion/lottie # bun プロジェクト
yarn remotion add @remotion/lottie # yarn プロジェクト
pnpm exec remotion add @remotion/lottie # pnpm プロジェクト
```

## Lottie ファイルの表示

Lottie アニメーションを import する手順:

- Lottie asset を fetch
- 読み込みを `delayRender()` / `continueRender()` で包む
- animation data を state に保存
- `@remotion/lottie` の `Lottie` コンポーネントで render

```tsx
import { Lottie, LottieAnimationData } from "@remotion/lottie";
import { useEffect, useState } from "react";
import { cancelRender, continueRender, delayRender } from "remotion";

export const MyAnimation = () => {
  const [handle] = useState(() => delayRender("Loading Lottie animation"));

  const [animationData, setAnimationData] = useState<LottieAnimationData | null>(null);

  useEffect(() => {
    fetch("https://assets4.lottiefiles.com/packages/lf20_zyquagfl.json")
      .then((data) => data.json())
      .then((json) => {
        setAnimationData(json);
        continueRender(handle);
      })
      .catch((err) => {
        cancelRender(err);
      });
  }, [handle]);

  if (!animationData) {
    return null;
  }

  return <Lottie animationData={animationData} />;
};
```

## スタイルとアニメーション

Lottie は `style` prop でスタイルとアニメーションを指定できます:

```tsx
return <Lottie animationData={animationData} style={{ width: 400, height: 400 }} />;
```
