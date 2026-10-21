# Storybook の視覚的リグレッション

Issue #907 の画像比較は、既存の拡張 E2E、Storybook interaction、a11y 検査を補完します。
実際の SavedTabsPage、OptionsRoute、Import ダイアログ、SavedTabsChatPanel を使用し、
保存 URL・設定・会話はすべて合成 fixture です。Ollama 接続やユーザーの拡張 profile は不要です。

## 比較範囲

各画面を Chromium / Firefox の両方で次の条件により比較します。
合計 32 枚の viewport 画像を Git で管理し、CI は各ケースを 3 回実行します（96 比較）。
全条件の直積を増やす前に、追加の検出力と実行時間を測定してください。

| 条件      | 幅 × 高さ  | theme | locale |
| --------- | ---------- | ----- | ------ |
| light-en  | 1280 × 900 | light | en     |
| dark-en   | 1280 × 900 | dark  | en     |
| narrow-en | 390 × 900  | light | en     |
| light-ja  | 1280 × 900 | light | ja     |

Options は初期 viewport の比較です。画面内のスクロール後の項目や保存・復元の成功は、
引き続き既存の unit / 拡張 E2E で検証します。Import は portal を含むページ全体を撮影します。
AI Chat は完了済みの固定メッセージを使用し、ストリーミングやモデル実行は行いません。

## 比較と更新

通常コマンドは `bun run test:visual` です。基準画像の欠落と差分は失敗し、
自動更新、retry、失敗の許容は行いません。CI は `bun run test:visual --repeat-each=3` を実行します。
HTML report、JSON の件数・所要時間、失敗時の trace と画像は 14 日保持します。

基準環境は **Linux amd64 / Playwright 1.63.0 Noble image** です。
OS やフォント描画が異なる macOS の画像を Linux 基準として commit しないでください。
環境差については [Playwright の画像比較](https://playwright.dev/docs/test-snapshots) と
[公式 Docker image](https://playwright.dev/docs/docker) の説明も参照できます。
ネイティブ実行は OS 別の基準パスを使うため、未作成の場合は明示的に失敗します。

リポジトリの root で、CI と同じ image を使って更新できます。
依存ディレクトリは匿名 volume に分け、ホストの `node_modules` は使いません。

```sh
docker run --rm --platform linux/amd64 --ipc=host \
  -v "$PWD:/work" -v /work/node_modules -w /work \
  mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27 \
  bash -lc 'npm install --global bun@1.3.14 && bun install --frozen-lockfile && bun run test:visual:update && bun run test:visual --repeat-each=3'
```

更新した `e2e/visual/snapshots/linux/` の PNG を diff とともにレビューしてください。
意図しない差分を取り込むために全画像を無条件で再生成しないでください。
Playwright / image のバージョンを変える場合は、lockfile、CI image、この手順を同時に更新します。

## 誤検知の切り分けとコスト

- 時刻、UTC、device scale、viewport、locale、color scheme、reduced motion を固定します。
- play が期待する翻訳と画面の読み込みを確認してから ready にします。フォント完了も待ちます。
- Storybook server 以外の通信を遮断し、外部 favicon、Web font、Ollama に依存しません。
- animation と caret は撮影時に無効化します。UI の mask は使用しません。
- 許容する差分ピクセルは 0。色差 threshold は Playwright 標準の 0.2 です。

差分が出たら report の expected / actual / diff を確認し、同じ image で再実行します。
再現する UI 差分は修正または意図した baseline 更新へ進め、再現しない差分は readiness、
未固定データ、描画環境を調べます。閾値を広げたり retry で隠したりしません。

2026-10-21 の導入時測定（macOS arm64 上の Linux amd64 Docker、Node 24 / Bun 1.3.14）:

| 検証                     | 結果                                                                    |
| ------------------------ | ----------------------------------------------------------------------- |
| 初回 baseline 生成       | 両ブラウザ 32 件成功、約 2.5 分                                         |
| 修正後の比較 3 回        | 96/96 成功、unexpected / flaky / skipped はすべて 0                     |
| 比較の wall time         | 300.7 秒（Storybook build・server 起動を含む。依存 install は含まない） |
| 最大 1 ケース            | 6.20 秒                                                                 |
| 意図した 12px の表示ずれ | Chromium 16,431 / Firefox 11,897 ピクセル差分を検出して失敗             |
| baseline の保存量        | 32 枚 / 2,093,085 bytes（各画面・browser の 4 条件で別画像）            |

初回の 96 比較では画像差分はなく、Import の初期読み込み待ちが 1 件失敗しました。
trace 上では lazy JS の読み込みに 0.7〜2.6 秒、設定初期化開始まで約 7.1 秒かかり、
既定 5 秒の assertion が先に終了していました。ready 条件を既存のテスト期限内で待つよう
修正し、上記 96 比較を再検証しています。固定 sleep、retry、許容ピクセル数の増加はありません。

この 96 比較で画像の誤検知は観測していませんが、長期的な発生率を保証するものではありません。
初回と再実行では並走負荷が異なるため、所要時間差を性能改善とは扱いません。
CI runner の実時間は job の経過時間と `visual-report.json` の `stats.duration` で評価し、
ローカルのエミュレーション時間とは分けます。CI は install を含め 15 分を上限とし、
現段階は 32 画像のレビューと、意図した変更時の baseline 更新を必要な運用コストとします。
