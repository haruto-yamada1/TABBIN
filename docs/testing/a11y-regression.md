# a11y 回帰検証の棚卸しと追加軸 (Issue #1021)

既存の axe 検証・キーボード D&D・視覚回帰は「通常幅・通常配色・
ポインタ併用」を前提にしており、OS の高コントラスト設定や
200〜400% ズーム相当の狭幅では操作不能になる回帰を拾えなかった。
本書は既存カバー範囲の棚卸し、#1021 で追加した自動検証、
自動化できない条件の手動チェックリスト、環境依存の限界を記録する。

## 既存カバー範囲 (棚卸し)

| 検証             | ファイル                                                                  | カバー内容                                                                                               | 限界                                                                                 |
| ---------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| axe smoke        | `e2e/saved-tabs.a11y.extension.spec.ts`                                   | Saved Tabs (Domain) 表示状態の WCAG 2.0/2.1 A・AA violation 0 件                                         | 単一画面・通常幅・通常配色のみ。Custom / ダイアログ表示中は未対象                    |
| axe smoke        | `e2e/options.a11y.extension.spec.ts`                                      | Options 表示状態の axe violation 0 件                                                                    | Import/Export 操作中・ダイアログ表示中は未対象                                       |
| キーボード D&D   | `e2e/keyboard-dnd.extension.spec.ts`                                      | Domain/Custom の URL・カテゴリ並び替え (Tab 到達、確定、取消、永続化)                                    | 並び替え専用。検索・削除・Undo など日常操作のキーボード完結性は未対象                |
| reduced motion   | `e2e/reduced-motion.extension.spec.ts` + `docs/testing/reduced-motion.md` | `prefers-reduced-motion` 下の CSS 優先、ダイアログ開閉、toast、キーボード並び替え                        | 動きの軸のみ。配色・ズームは対象外                                                   |
| 視覚回帰         | `e2e/visual/screens.visual.spec.ts` + `docs/testing/visual-regression.md` | Saved Tabs / Options / Import / AI Chat を Chromium・Firefox で 4 条件 (light/dark/narrow 390px/ja) 比較 | narrow は 390px 1 条件のみ。forced-colors なし。画像差分のみで操作可能性は検証しない |
| Firefox smoke 群 | `e2e/firefox.extension.*.spec.ts`                                         | 選択・検索履歴・キーボード D&D 等の共有シナリオを実 Firefox で実行                                       | a11y 専用シナリオ (axe / forced-colors / ズーム) は Firefox 未実施                   |

未検証だった領域 (#1021 で扱う):

- 200% / 400% ズーム相当の狭幅での水平スクロール・操作要素の破綻
- forced-colors (Windows ハイコントラスト相当) での focus indicator と操作
- 検索・削除・削除確認・Undo のキーボード only 完結性
- ダイアログの Escape 取消と再開

## #1021 で追加した自動検証

`e2e/a11y-regression.extension.spec.ts` (Chromium 拡張、`bun run e2e:a11y` の
`accessibility` grep に含まれる):

| テスト                  | 検証内容                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 200% ズーム相当 (640px) | Saved Tabs Domain/Custom と Options で document の水平オーバーフローなし、検索欄・Export ボタンが viewport 内                                                                  |
| 400% ズーム相当 (320px) | Domain で検索による絞り込み・復帰が動作、水平オーバーフローなし、同幅で axe violation 0 件、Options の Export が viewport 内。スクリーンショットを testInfo に添付             |
| forced-colors           | `forcedColors: 'active'` エミュレーション下で Tab 到達したボタン・検索欄の focus outline が solid 2px 以上で視認できること、検索入力で絞り込めること。スクリーンショットを添付 |
| キーボード only         | Tab のみで検索到達・入力・クリア、最初の Delete tab へ Tab 移動して Enter で削除、toast の Undo へ Tab 移動して Enter で復元                                                   |
| 削除確認ダイアログ      | custom の一括削除確認 (alertdialog) を Enter で開き、Escape で取消 (件数不変)、再度開いてダイアログ内の Delete へ Tab 移動し Enter で確定                                      |
| ダイアログ Escape       | Add project ダイアログを Enter で開き (初期フォーカスはダイアログ内)、Escape で閉じ、トリガーから再び開けること                                                                |

ズーム相当の考え方: 基準幅 1280px に対し 200% = 640px、400% = 320px の
CSS viewport 幅で再現する。これは WCAG のリフロー確認 (320 CSS px) と同じ
近似であり、ブラウザ実ズームそのものではない (下記「環境限界」)。

### 検出した製品側の問題と最小修正

forced-colors 下では Tailwind の focus ring (box-shadow) がブラウザに
無効化され、`outline` も `none` のため、キーボードフォーカスの位置が
実質見えなくなっていた (border 色の変化のみ)。
`src/assets/global.css` に forced-colors 時のみ
`:focus-visible { outline: 2px solid Highlight; outline-offset: 2px; }`
を追加する最小修正を行い、`src/lib/global-styles.test.ts` に CSS 契約の
unit test を追加した。通常配色の表示は変わらない。

### 切り分けた観測 (未修正・要調査)

- Domain モードの単体削除は、`confirmDeleteEach: true` を seed しても
  probe では確認ダイアログを出さず直接削除された (保存先 storage 上は
  `true` を確認)。custom の一括削除確認 (`confirmDeleteAll`) は
  既存 e2e と同じ seed 形状で正常に開く。Domain 単体削除の設定反映経路は
  本 issue の範囲外として未修正であり、下記手動チェックにも含める。
- Add project ダイアログを Escape で閉じると、フォーカスはトリガー
  ボタンではなく `body` へ戻る。操作の再開自体は可能だが、
  フォーカス復帰先の改善は別 issue 候補とする。

## Chrome / Firefox の検証範囲

| 軸                                                 | Chrome (Chromium)        | Firefox                                                                                          |
| -------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------ |
| axe smoke                                          | 自動 (`e2e:a11y`)        | 未実施                                                                                           |
| 視覚回帰 (通常配色)                                | 自動 (Storybook、4 条件) | 自動 (同左)                                                                                      |
| キーボード D&D / reduced motion                    | 自動                     | 実拡張シナリオで自動 (共有 helper)                                                               |
| ズーム相当・forced-colors・キーボード only (#1021) | 自動 (本書の spec)       | **未実施**。拡張 fixture が Chromium persistent context 前提のため。Firefox は手動チェックで補う |

## 環境限界

- Playwright の `forcedColors: 'active'` は Chromium のエミュレーションであり、
  Windows 実機のハイコントラストテーマ (システム色の割当、Firefox の
  `browser.display.forced_color` 等) と完全には一致しない。
- OS レベルの 200〜400% ズーム、ブラウザ実ズームでのピンチ/再配置、
  スクリーンリーダー (NVDA / JAWS / VoiceOver) の読み上げ順序と
  ライブリージョン通知は Playwright から再現できない。
- 拡張 E2E の fixture は Chromium 専用 (`launchPersistentContext` +
  `--load-extension`)。Firefox 実拡張での a11y 専用シナリオは
  現行基盤では自動化できない。
- 狭幅 viewport はズームの近似であり、デバイスピクセル比や
  OS スケーリングを伴う実ズームとは描画が異なる場合がある。

## 手動チェックリスト (リリース前・該当変更時)

OS 依存で自動化しない項目。実機または実ブラウザで確認し、
結果を PR か issue に記録する。

- [ ] Windows ハイコントラスト (または macOS のコントラスト強調) で
      Saved Tabs / Options / 各ダイアログの操作要素とフォーカスが識別できる
- [ ] ブラウザズーム 200% / 400% で Saved Tabs (Domain/Custom)、Options、
      Import/Export、AI Chat に水平スクロールや文字の切れ・重なりがない
- [ ] Firefox 実拡張で検索・削除・Undo がキーボードのみで完結する
- [ ] NVDA / VoiceOver で削除 toast (Undo 提示) とダイアログの
      タイトル・説明が読み上げられる
- [ ] Domain モードの単体削除で「削除のたびに確認」が有効な場合に
      確認ダイアログが表示される (上記「切り分けた観測」の再確認)
- [ ] ダイアログを Escape で閉じた際のフォーカス位置が
      操作の再開を妨げない
