---
name: security-review
description: TABBIN のブラウザ拡張 security、permission、storage handling、user-provided content、dependency change、release-sensitive code をレビューするときに使います。
---

# Security Review

変更が user data、extension permission、rendered content、network access、
storage、background action、import、release packaging に影響し得る場合に
この skill を使います。

## レビュー範囲

TABBIN の browser extension threat model に照らして変更を確認します。

- `manifest` と host permission が最小限で、理由を説明できる。
- `chrome.storage` / `browser.storage` に secret、不要な personal data、
  retention behavior の無い無制限 data を保存していない。
- user-provided title、URL、AI output、markdown、imported JSON を unsafe HTML path
  経由で render していない。
- background action が tabs、windows、storage、notification state を変更する前に
  input を validate している。
- URL handling が scheme と origin boundary を保ち、trusted page context を
  仮定していない。
- log と error が token、prompt content、private URL、imported tab data を
  漏らしていない。
- dependency と dynamic import が必要で、active に維持されており、既存の
`bun run quality:check` / `bun run test:coverage` gate を弱めていない。

## ワークフロー

1. diff が触る security-sensitive surface を特定します。
2. entry point から sink まで data を追跡します。対象は UI input、storage、
   background message、imported file、AI output、browser API です。
3. 新しい capability を提案する前に permission と storage の最小化を確認します。
4. ad hoc な browser API call より、`src/lib/` の既存 wrapper と typed data
   structure を優先します。
5. risk がまだ覆われていない場合は、validation、sanitization、permission、
   storage behavior に focused test を追加または調整します。
6. findings を最初に報告し、file path と具体的な exploit path / failure path を
   示します。問題が無い場合は、残る risk と実行した check を述べます。

## TABBIN 固有の Red Flag

- 新しい `dangerouslySetInnerHTML` 使用、または markdown / AI output escaping の変更。
- 新しい broad host permission、optional permission、background capability。
- 明確な必要性が無い full URL、prompt、imported data の保存。
- display text だけに基づく tab の close、move、delete、restore。
- storage と UI が diverge し得る箇所で browser API failure を握りつぶすこと。
- background code が直接 callable なまま、security check が UI code にしか無いこと。
