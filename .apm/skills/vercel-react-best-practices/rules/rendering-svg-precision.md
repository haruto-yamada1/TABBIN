---
title: SVG 精度の最適化
impact: LOW
impactDescription: ファイルサイズの削減
tags: rendering, svg, optimization, svgo
---

## SVG 精度の最適化

SVG 座標精度を下げてファイルサイズを削減します。最適な精度は viewBox サイズに依存しますが、一般に精度の削減を検討すべきです。

**不適切（過剰な精度）:**

```svg
<path d="M 10.293847 20.847362 L 30.938472 40.192837" />
```

**適切（小数点以下 1 桁）:**

```svg
<path d="M 10.3 20.8 L 30.9 40.2" />
```

**SVGO で自動化:**

```bash
npx svgo --precision=1 --multipass icon.svg
```
