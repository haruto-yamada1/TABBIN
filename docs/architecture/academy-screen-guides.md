# Academy の画面案内

Issue #1002 の画面案内は、本番の保存タブ画面を読み取り専用で説明します。
`/academy/domain-mode` と `/academy/parent-categories` の「画面案内」から開始します。
動画は未提供の理由を表示し、書込練習は既存の隔離された `practice.html` へ分離します。
拡張のインストールやツールバー固定はテキストで説明し、ツアーの対象にしません。

## 実行と達成判定

- `AppLayout` は有効な `guide` query があるときだけ Joyride を含む画面案内を遅延ロードします。
- `useScreenGuideController` が開始、次へ、戻る、スキップ、閉じる、再試行と再実行を管理します。
- 表示モードは既存 HashRouter の `/saved-tabs?mode=...` で切り替えます。
  親カテゴリ管理は実 UI の専用アンカーを持つボタンを開き、実際の Dialog の表示を待ちます。
- 対象は `data-tour` で指定します。DOM 階層や見た目の CSS クラスは契約にしません。
  動的マウントは可視性を確認し、4秒で打ち切ります。対象が消えた場合も回復画面へ移ります。
  空データ、閉じられた領域、読込失敗でも完了に進めず、再試行・終了・テキストへの復帰を提供します。
- 最後まで対象の表示を確認したときだけ application の `recordGuideViewed` を呼びます。
  保存失敗の再試行は元の操作を再実行します。スキップの失敗を閲覧完了へ変換しません。
- ガイド閲覧は独立した `guideViewedAt` です。動画視聴・実習達成・習得済みにはなりません。
  詳細な永続化・互換性・リセット方針は [ADR 0002](../adr/0002-academy-progress.md) に記載します。

## 読み取り専用とアクセシビリティ

本番 UI を複製せず、既存の保存 URL とカテゴリを表示します。サンプルの投入、URL の復元、
保存・削除・ドラッグ操作は実行しません。Joyride の spotlight 内を含む背景操作を遮断し、
読込・回復中も capture guard でタブ操作・キー操作が本番 UI に届かないようにします。
ツアーが開く操作は親カテゴリ管理の開閉だけです。画面案内には保存タブの書込 use-case を渡しません。

Joyride の tooltip は既存 Button とテーマを使用し、実 Dialog 内ではその Dialog に portal を
置きます。focus trap と Escape を維持し、狭幅では吹き出しを viewport 内で折返し・スクロールします。
`prefers-reduced-motion` ではスクロール時間を0にし、既存 global CSS の reduced-motion 規則が
transition を抑制します。UI 文言は日本語・英語を用意します。

## 依存と検証

`react-joyride@3.2.0` を完全固定し、lockfile の integrity を保持します。同梱の package.json は
React / React DOM 16.8–19 を peer dependency とし、LICENSE は MIT です。
公式 API は [Getting Started](https://react-joyride.com/docs/getting-started) を参照します。
間接依存のライセンスは配布成果物の inventory で原文・integrity・digest を検証します。
新しい拡張権限、外部送信、production のネットワーク依存は追加しません。

Vitest は進捗の独立性、旧形式、失敗再試行、対象の可視性・消失と中断を検証します。
Playwright は実拡張の Domain/Custom、Radix Dialog、空状態、狭幅、Escape、focus と axe を検証し、
保存データ・設定・実タブ ID が変化しないことを前後比較します。
