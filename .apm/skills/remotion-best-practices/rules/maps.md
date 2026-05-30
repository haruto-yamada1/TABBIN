---
name: maps
description: Mapbox で地図アニメーションを作成
metadata:
  tags: map, map animation, mapbox
---

Mapbox で Remotion 動画に地図を追加できます。  
[Mapbox documentation](https://docs.mapbox.com/mapbox-gl-js/api/) に API リファレンスがあります。

## 前提条件

Mapbox と `@turf/turf` をインストールします。

lockfile を検索し、package manager に応じたコマンドを実行:

`package-lock.json` がある場合:

```bash
npm i mapbox-gl @turf/turf @types/mapbox-gl
```

`bun.lock` がある場合:

```bash
bun i mapbox-gl @turf/turf @types/mapbox-gl
```

`yarn.lock` がある場合:

```bash
yarn add mapbox-gl @turf/turf @types/mapbox-gl
```

`pnpm-lock.yaml` がある場合:

```bash
pnpm i mapbox-gl @turf/turf @types/mapbox-gl
```

ユーザーは無料 Mapbox アカウントを作成し、https://console.mapbox.com/account/access-tokens/ で access token を取得する必要があります。

Mapbox token は `.env` に追加します:

```txt title=".env"
REMOTION_MAPBOX_TOKEN=pk.your-mapbox-access-token
```

## 地図の追加

Remotion で地図を表示する基本例:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { AbsoluteFill, useDelayRender, useVideoConfig } from "remotion";
import mapboxgl, { Map } from "mapbox-gl";

export const lineCoordinates = [
  [6.56158447265625, 46.059891147620725],
  [6.5691375732421875, 46.05679376154153],
  [6.5842437744140625, 46.05059898938315],
  [6.594886779785156, 46.04702502069337],
  [6.601066589355469, 46.0460718554722],
  [6.6089630126953125, 46.0365370783104],
  [6.6185760498046875, 46.018420689207964],
];

mapboxgl.accessToken = process.env.REMOTION_MAPBOX_TOKEN as string;

export const MyComposition = () => {
  const ref = useRef<HTMLDivElement>(null);
  const { delayRender, continueRender } = useDelayRender();

  const { width, height } = useVideoConfig();
  const [handle] = useState(() => delayRender("Loading map..."));
  const [map, setMap] = useState<Map | null>(null);

  useEffect(() => {
    const _map = new Map({
      container: ref.current!,
      zoom: 11.53,
      center: [6.5615, 46.0598],
      pitch: 65,
      bearing: 0,
      style: "⁠mapbox://styles/mapbox/standard",
      interactive: false,
      fadeDuration: 0,
    });

    _map.on("style.load", () => {
      // Hide all features from the Mapbox Standard style
      const hideFeatures = [
        "showRoadsAndTransit",
        "showRoads",
        "showTransit",
        "showPedestrianRoads",
        "showRoadLabels",
        "showTransitLabels",
        "showPlaceLabels",
        "showPointOfInterestLabels",
        "showPointsOfInterest",
        "showAdminBoundaries",
        "showLandmarkIcons",
        "showLandmarkIconLabels",
        "show3dObjects",
        "show3dBuildings",
        "show3dTrees",
        "show3dLandmarks",
        "show3dFacades",
      ];
      for (const feature of hideFeatures) {
        _map.setConfigProperty("basemap", feature, false);
      }

      _map.setConfigProperty("basemap", "colorTrunks", "rgba(0, 0, 0, 0)");

      _map.addSource("trace", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: lineCoordinates,
          },
        },
      });
      _map.addLayer({
        type: "line",
        source: "trace",
        id: "line",
        paint: {
          "line-color": "black",
          "line-width": 5,
        },
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
      });
    });

    _map.on("load", () => {
      continueRender(handle);
      setMap(_map);
    });
  }, [handle, lineCoordinates]);

  const style: React.CSSProperties = useMemo(
    () => ({ width, height, position: "absolute" }),
    [width, height],
  );

  return <AbsoluteFill ref={ref} style={style} />;
};
```

Remotion では次が重要です:

- アニメーションは `useCurrentFrame()` で駆動し、Mapbox 自身のアニメーションは無効化します。例: `fadeDuration` を `0`、`interactive` を `false` など。
- 地図読み込みは `useDelayRender()` で遅延し、読み込み完了まで map を `null` にします。
- ref を持つ要素には **必ず** 明示的な width / height と `position: "absolute"` が必要です。
- `_map.remove();` の cleanup は追加しないでください。

## 線の描画

依頼がない限り、線に glow effect を追加しないでください。  
依頼がない限り、線に追加ポイントを入れないでください。

## 地図スタイル

既定では `mapbox://styles/mapbox/standard` スタイルを使います。  
ベース map スタイルのラベルは非表示にします。

依頼がない限り、Mapbox Standard スタイルの feature をすべて削除します。

```tsx
// Hide all features from the Mapbox Standard style
const hideFeatures = [
  "showRoadsAndTransit",
  "showRoads",
  "showTransit",
  "showPedestrianRoads",
  "showRoadLabels",
  "showTransitLabels",
  "showPlaceLabels",
  "showPointOfInterestLabels",
  "showPointsOfInterest",
  "showAdminBoundaries",
  "showLandmarkIcons",
  "showLandmarkIconLabels",
  "show3dObjects",
  "show3dBuildings",
  "show3dTrees",
  "show3dLandmarks",
  "show3dFacades",
];
for (const feature of hideFeatures) {
  _map.setConfigProperty("basemap", feature, false);
}

_map.setConfigProperty("basemap", "colorMotorways", "transparent");
_map.setConfigProperty("basemap", "colorRoads", "transparent");
_map.setConfigProperty("basemap", "colorTrunks", "transparent");
```

## カメラのアニメーション

`useEffect` で現在フレームに基づき camera position を更新すれば、線に沿って camera をアニメーションできます。

依頼がない限り、camera angle 間を jump させないでください。

```tsx
import * as turf from "@turf/turf";
import { interpolate } from "remotion";
import { Easing } from "remotion";
import { useCurrentFrame, useVideoConfig, useDelayRender } from "remotion";

const animationDuration = 20;
const cameraAltitude = 4000;
```

```tsx
const frame = useCurrentFrame();
const { fps } = useVideoConfig();
const { delayRender, continueRender } = useDelayRender();

useEffect(() => {
  if (!map) {
    return;
  }
  const handle = delayRender("Moving point...");

  const routeDistance = turf.length(turf.lineString(lineCoordinates));

  const progress = interpolate(frame / fps, [0.00001, animationDuration], [0, 1], {
    easing: Easing.inOut(Easing.sin),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const camera = map.getFreeCameraOptions();

  const alongRoute = turf.along(turf.lineString(lineCoordinates), routeDistance * progress).geometry
    .coordinates;

  camera.lookAtPoint({
    lng: alongRoute[0],
    lat: alongRoute[1],
  });

  map.setFreeCameraOptions(camera);
  map.once("idle", () => continueRender(handle));
}, [lineCoordinates, fps, frame, handle, map]);
```

注意:

重要: 既定では camera を北が上になるよう保ちます。  
重要: 多段アニメーションでは、すべての stage で zoom、position、line progress などすべての property を設定し、jump を防ぎます。初期値を上書きします。

- progress は最小値で clamp し、線が空になって turf error になるのを防ぎます
- timing の詳細は [Timing](./timing.md) を参照
- composition の dimensions を考慮し、縮小時も読めるよう線の太さと label font size を十分大きくします

## 線のアニメーション

### 直線（線形補間）

map 上で直線に見える線をアニメーションするには、座標間の線形補間を使います。turf の `lineSliceAlong` / `along` は **使わない** でください。geodesic（大圏）計算のため Mercator 投影では曲がって見えます。

```tsx
const frame = useCurrentFrame();
const { durationInFrames } = useVideoConfig();

useEffect(() => {
  if (!map) return;

  const animationHandle = delayRender("Animating line...");

  const progress = interpolate(frame, [0, durationInFrames - 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  // Linear interpolation for a straight line on the map
  const start = lineCoordinates[0];
  const end = lineCoordinates[1];
  const currentLng = start[0] + (end[0] - start[0]) * progress;
  const currentLat = start[1] + (end[1] - start[1]) * progress;

  const lineData: GeoJSON.Feature<GeoJSON.LineString> = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: [start, [currentLng, currentLat]],
    },
  };

  const source = map.getSource("trace") as mapboxgl.GeoJSONSource;
  if (source) {
    source.setData(lineData);
  }

  map.once("idle", () => continueRender(animationHandle));
}, [frame, map, durationInFrames]);
```

### 曲線（geodesic / 大圏）

2 点間の geodesic（大圏）経路に沿う線には turf の `lineSliceAlong` を使います。飛行経路や地球上の最短距離表示に便利です。

```tsx
import * as turf from "@turf/turf";

const routeLine = turf.lineString(lineCoordinates);
const routeDistance = turf.length(routeLine);

const currentDistance = Math.max(0.001, routeDistance * progress);
const slicedLine = turf.lineSliceAlong(routeLine, 0, currentDistance);

const source = map.getSource("route") as mapboxgl.GeoJSONSource;
if (source) {
  source.setData(slicedLine);
}
```

## マーカー

適宜 label と marker を追加します。

```tsx
_map.addSource("markers", {
  type: "geojson",
  data: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "Point 1" },
        geometry: { type: "Point", coordinates: [-118.2437, 34.0522] },
      },
    ],
  },
});

_map.addLayer({
  id: "city-markers",
  type: "circle",
  source: "markers",
  paint: {
    "circle-radius": 40,
    "circle-color": "#FF4444",
    "circle-stroke-width": 4,
    "circle-stroke-color": "#FFFFFF",
  },
});

_map.addLayer({
  id: "labels",
  type: "symbol",
  source: "markers",
  layout: {
    "text-field": ["get", "name"],
    "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
    "text-size": 50,
    "text-offset": [0, 0.5],
    "text-anchor": "top",
  },
  paint: {
    "text-color": "#FFFFFF",
    "text-halo-color": "#000000",
    "text-halo-width": 2,
  },
});
```

十分大きくします。composition dimensions を確認し、label を比例して scale します。  
1920x1080 の composition では label font size は少なくとも 40px にします。

重要: `text-offset` は marker に近い値に保ちます。marker circle radius を考慮します。radius 40 なら次が良い offset です:

```tsx
"text-offset": [0, 0.5],
```

## 3D 建物

3D 建物を有効にするコード:

```tsx
_map.setConfigProperty("basemap", "show3dObjects", true);
_map.setConfigProperty("basemap", "show3dLandmarks", true);
_map.setConfigProperty("basemap", "show3dBuildings", true);
```

## レンダリング

地図アニメーションを render するときは次の flag を付けてください:

```
npx remotion render --gl=angle --concurrency=1
```
