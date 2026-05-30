---
name: compositions
description: Composition、still、folder、default props、動的メタデータの定義
metadata:
  tags: composition, still, folder, props, metadata
---

`<Composition>` はレンダリング可能な動画のコンポーネント、幅、高さ、fps、期間を定義します。

通常は `src/Root.tsx` に配置します。

```tsx
import { Composition } from "remotion";
import { MyComposition } from "./MyComposition";

export const RemotionRoot = () => {
  return (
    <Composition
      id="MyComposition"
      component={MyComposition}
      durationInFrames={100}
      fps={30}
      width={1080}
      height={1080}
    />
  );
};
```

## デフォルト props

コンポーネントの初期値には `defaultProps` を渡します。  
値は JSON シリアライズ可能である必要があります（`Date`、`Map`、`Set`、`staticFile()` はサポート）。

```tsx
import { Composition } from "remotion";
import { MyComposition, MyCompositionProps } from "./MyComposition";

export const RemotionRoot = () => {
  return (
    <Composition
      id="MyComposition"
      component={MyComposition}
      durationInFrames={100}
      fps={30}
      width={1080}
      height={1080}
      defaultProps={
        {
          title: "Hello World",
          color: "#ff0000",
        } satisfies MyCompositionProps
      }
    />
  );
};
```

`defaultProps` の型安全のため、`interface` より `type` 宣言を使います。

## Folder

`<Folder>` で sidebar の composition を整理します。  
Folder 名は英字、数字、ハイフンのみ使えます。

```tsx
import { Composition, Folder } from "remotion";

export const RemotionRoot = () => {
  return (
    <>
      <Folder name="Marketing">
        <Composition id="Promo" /* ... */ />
        <Composition id="Ad" /* ... */ />
      </Folder>
      <Folder name="Social">
        <Folder name="Instagram">
          <Composition id="Story" /* ... */ />
          <Composition id="Reel" /* ... */ />
        </Folder>
      </Folder>
    </>
  );
};
```

## Still

単一フレーム画像には `<Still>` を使います。`durationInFrames` / `fps` は不要です。

```tsx
import { Still } from "remotion";
import { Thumbnail } from "./Thumbnail";

export const RemotionRoot = () => {
  return <Still id="Thumbnail" component={Thumbnail} width={1280} height={720} />;
};
```

## Calculate Metadata

`calculateMetadata` で dimensions、duration、props をデータに基づき動的に設定します。

```tsx
import { Composition, CalculateMetadataFunction } from "remotion";
import { MyComposition, MyCompositionProps } from "./MyComposition";

const calculateMetadata: CalculateMetadataFunction<MyCompositionProps> = async ({
  props,
  abortSignal,
}) => {
  const data = await fetch(`https://api.example.com/video/${props.videoId}`, {
    signal: abortSignal,
  }).then((res) => res.json());

  return {
    durationInFrames: Math.ceil(data.duration * 30),
    props: {
      ...props,
      videoUrl: data.url,
    },
  };
};

export const RemotionRoot = () => {
  return (
    <Composition
      id="MyComposition"
      component={MyComposition}
      durationInFrames={100} // プレースホルダー、上書きされる
      fps={30}
      width={1080}
      height={1080}
      defaultProps={{ videoId: "abc123" }}
      calculateMetadata={calculateMetadata}
    />
  );
};
```

この関数は `props`、`durationInFrames`、`width`、`height`、`fps`、codec 関連の既定値を返せます。render 開始前に 1 回実行されます。

## 別 Composition 内へのネスト

composition 内に別 composition を入れるには、`<Sequence>` に `width` / `height` を指定します。

```tsx
<AbsoluteFill>
  <Sequence width={COMPOSITION_WIDTH} height={COMPOSITION_HEIGHT}>
    <CompositionComponent />
  </Sequence>
</AbsoluteFill>
```
