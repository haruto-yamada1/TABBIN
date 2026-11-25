# Academy 動画制作パイプライン

Issue #999 の制作専用 TypeScript ツールです。`../scenarios/save-tabs.json` は
#998 の本物の native 保存クリップと、同じ実保存 snapshot を使った実 Domain UI の
自動録画から27秒の教材を生成します。架空の TABBIN UI は生成しません。
全8本の制作・本番登録と章別再生成は[教材README](../scenarios/README.md)を参照してください。

## 前提と最初の生成

1. リポジトリ指定の Bun / Node、`bun install --frozen-lockfile`、Playwright に対応した
   Chromium を準備し、`bun run build` で撮影対象の開発版を生成します。
2. FFmpeg / ffprobe（H.264 encoder `libx264`、PNG、overlay、fade、concat、scale）を
   ローカル開発環境に準備します。既存 Playwright 付属の小型 FFmpeg では不足します。
   PATH または `FFMPEG_PATH` / `FFPROBE_PATH` で指定します。通常 CI のための自動
   インストールや本番依存の追加はありません。
3. [native 撮影手順](../recording/README.md)と
   [ADR 0004](../../../docs/adr/0004-academy-native-recording.md)に従い、専用プロファイルで
   インストール・固定・6タブ保存を実録画し、原本レビューと `finalize.ts` を完了します。
   `final-result.json` と元の証跡一式を保持してください。native 操作は事前の手作業です。
4. 日本語を含むローカルの利用許諾済み font ファイルを指定します。再撮影では同じ
   ファイルを使い、render.json の hash も比較します。フォントはコピー・配布しません。

```sh
bun run academy:make -- --lesson save-tabs \
  --native-run /absolute/path/to/recordings/academy/poc-XXXXXX \
  --locale ja --font '/absolute/path/to/licensed-cjk-font.ttc'
```

一つのコマンドで原本の読み取り専用検証、録画、編集、デコード検査まで実行します。
CLI は `recording` / `recorded` / `rendering` / `passed` の JSON に take の場所を出します。
成功時の `directory` に MP4、日英 VTT、scenario、入力 hash、render/verification JSON が
揃います。各原本は別 input として保持され、元の #998 run は変更されません。
保存前の「Options でウィンドウのすべてのタブを保存へ変更済み」という字幕を残します。

工程を分ける場合は次を使います。record の成功 take はロケール別の render で再利用できます。

```sh
bun run academy:record -- --lesson save-tabs --native-run /absolute/path/to/poc-XXXXXX
bun run academy:render -- --run /absolute/path/to/recorded-take --locale ja --font /absolute/path/to/font.ttc
bun run academy:render -- --run /absolute/path/to/recorded-take --locale en --font /absolute/path/to/font.ttc
bun run academy:verify -- --run /absolute/path/to/completed-render-directory
```

`--locale en` はカードと字幕を英語にします。実アプリは native 原本に合わせた日本語で、
ブラウザは Chrome / Chrome for Testing と明示されます。native 原本の UI 言語を
字幕で置き換えたように装いません。

## シナリオを追加する

`tools/academy/scenarios/` に JSON を追加します。`id`、`lessonId`、`version`、
`prerequisites`、`viewport`、`browserVersion`、`demoSeed`、`actions`、`assertions`、
`segments`、`captions`、`output` が契約です。現段階の seed と入力は #997/#998 の最小6 URLに
限定します。別の教材に拡張するときは、入力・assertion の validator と回帰検証も一緒に
拡張してください。現実にないブラウザ操作や任意 JavaScript を scenario に書けません。

`actions` は `assert-urls`、`assert-domains`、`focus-domain`。実 `data-tour` / role / exact
hostname を使います。assertion を通してから focus / scroll / hover を行い、`holdSeconds`
は字幕を読む時間にだけ使います。viewport、DPR、theme、locale、timezone と browser の版は
固定され、版不一致は停止します。`segments` は card / native（install・pin・save の区別）/
page を扱い、source の切り出し秒数・duration・簡易 zoom を宣言します。字幕は完成動画の
タイムライン上の start/end と ja/en テキストです。重複・範囲外・45秒超は拒否します。

## 撮り直し、失敗、差分確認

- `recordings/academy/pipeline/runs/` に撮影・編集 take を毎回新規作成します。
  失敗 take はログ・trace・screenshot・部分動画とともに保持し、成功扱いしません。
  browser 起動前や入力検証時の失敗では trace / screenshot は存在しません。
- Playwright は実データに接続しない一時 profile を作り、終了時に削除します。
  ページ外への通信は遮断します。native UI は Playwright viewport 動画に含まれません。
- 保存 snapshot と UI を読み込んだ後に on-demand screencast を開始し、準備中の画面を
  教材へ混入させません。trace は DOM snapshot、failure image は別ファイルで保存します。
- `releases/<lesson>/v<version>/<locale>/` の成功 directory は変更せず、最後に `latest.json`
  だけを atomic に切り替えます。decode / 字幕 / 容量 / source 改変が失敗したときは
  前回成功を保持します。修正後は同じ入力とコマンドで新 take を作ります。
- native 保存 → 説明用ページは同じ保存結果でも別テイクです。章カードと record manifest
  の編集点を削除しません。OS 差、ウィンドウ枠、native cursor の形は原本の条件として残し、
  ページ側の scroll は reduced motion、hover は実 pointer 操作で再現します。
- 再撮影では scenario version / seed、原本 hash、sourceCommit、browser、FFmpeg、font hash、
  render 設定を照合します。バイト一致を成功条件にせず、同じ秒の frame と全編再生を比較します。

完成動画は最低限、次の点を人が再生確認してから製品へ配置します。

- 本物のアイコンから保存され、実タブが閉じ、Domain にまとまる。
- 設定変更済みの説明、native/browser の区別、別テイクへの編集点が読める。
- タイトル、字幕、Domain が切れず、zoom でも必要な操作が隠れない。
- 個人データ、認証情報、他の拡張、失敗テイクが映っていない。
- pause / playbackRate と ja/en VTT が配信対象の Chrome / Firefox で機能する。

自動 gate は mp4/H.264/yuv420p、寸法、fps、duration、maxBytes、全フレーム decode、
日英 VTT と scenario の完全一致を確認します。デコーダー検査は人の内容確認を代替しません。
ブラウザ再生・字幕の手動確認結果は撮影日・ブラウザ版とともに検証記録に残します。

## 配布と検証

制作ツール、原本、trace、font、FFmpeg は production bundle に含めません。
必要な完成 MP4 と VTT だけを内容制作 Issue で本番配置し、既存 Academy の遅延ロードに
登録します。ここから `src/public/` への自動コピーや全動画の preload はしません。

```sh
bun run test:node tools/academy
bun run quality:check
bun run test:coverage
bun run zip
bun run zip:firefox
bun tools/academy/verifyArtifacts.ts .output/chrome-mv3 .output/firefox-mv2 .output/*.zip
```

Remotion の利用条件・費用と代替選択、出力 codec の判断は
[ADR 0005](../../../docs/adr/0005-academy-video-pipeline.md)を参照してください。

2026-11-08 の生成・デコード・Chrome/Firefox 再生の実測は
[sample-result.json](sample-result.json)、完成動画の抜粋は
[コンタクトシート](../../../docs/assets/issue-999-video-pipeline.png)に記録しています。
元動画と private な診断はローカルに保持し、通常の CI は native 素材や FFmpeg を
要求しません。CI の unit gate と実素材を使う制作検証は別の証拠です。
