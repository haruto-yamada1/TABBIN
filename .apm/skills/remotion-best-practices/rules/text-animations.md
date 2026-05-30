---
name: text-animations
description: Remotion のタイポグラフィとテキストアニメーション
metadata:
  tags: typography, text, typewriter, highlighter ken
---

## テキストアニメーション

Based on `useCurrentFrame()`, reduce the string character by character to create a typewriter effect.

## タイプライター効果

See [Typewriter](assets/text-animations-typewriter.tsx) for an advanced example with a blinking cursor and a pause after the first sentence.

Always use string slicing for typewriter effects. Never use per-character opacity.

## 単語ハイライト

See [Word Highlight](assets/text-animations-word-highlight.tsx) for an example for how a word highlight is animated, like with a highlighter pen.
