# Academy 8章の教材

Issue #1000。各JSONが操作、実録画の切り出し、字幕、尺、scenario versionの原本です。
字幕や操作を変えたときはJSONを更新して録画・編集・レビューを行います。
アプリの章IDは既存7件を維持し、`install-extension` を追加しています。

| lesson / scenario ID                        |  秒 | 映像と実際に確認する操作                                                      |
| ------------------------------------------- | --: | ----------------------------------------------------------------------------- |
| [install-extension](install-extension.json) |  30 | 公開ストアの追加ボタン、権限確認、導入完了後の保存一覧                        |
| [pin-extension](pin-extension.json)         |  20 | 本物の拡張機能メニュー、固定・解除・再固定。読みやすい範囲へcrop              |
| [save-tabs](save-tabs.json)                 |  27 | ウィンドウ全体を保存する設定、実アイコン、6タブ終了、3 Domainへの保存         |
| [domain-mode](domain-mode.json)             |  30 | 同じhostnameの2 URLずつを3 Domainで確認                                       |
| [parent-categories](parent-categories.json) |  40 | Learning / Personal作成、Domain割当、Learning deskへ改名、所属移動            |
| [child-categories](child-categories.json)   |  40 | Reading作成、Guidesへ改名、タイトルのguide/referenceによる実URL分類           |
| [reorder-items](reorder-items.json)         |  30 | 親、同じ親のDomain、子のハンドルをドラッグし、プレビュー後それぞれ確定        |
| [restore-tabs](restore-tabs.json)           |  25 | 1件とDomainの2件を背景タブへ実復元、成功分の削除。ブラウザAPIでも実タブを確認 |

最終更新は2026-11-08。save-tabsはv2、ほかはv1です。全体は242秒です。
日英のカードを持つ16 MP4、日英16 VTT、8 poster、8技術manifestを
WXTの実際のpublicDirである `src/public/academy/videos/` に配置します。
字幕は焼き込まず、プレイヤーで日本語・英語・OFFを選べます。音声・ナレーションはありません。
実UIの言語は日本語、撮影ブラウザはmacOSのChrome for Testingです。

## 再生成

先に[実ブラウザ録画手順](../recording/README.md)と
[ADR 0004](../../../docs/adr/0004-academy-native-recording.md)を読みます。
最小fixture以外のURLを開かず、通常のブラウザプロファイルは使いません。
導入・固定・保存は#998のfinalized native原本を読み取り専用で取り込みます。
原本がない場合は同じ手順で新規撮影し、レビューとfinalizeを完了してください。
公開版の導入を、開発版の読み込みや模擬画面で代替しません。

Bun/Node、Playwright Chromium、FFmpeg/ffprobe、利用許諾済み日本語フォントを準備し、
`bun run build` で現行の実UIをビルドします。詳細は
[パイプラインREADME](../pipeline/README.md)を参照してください。

```sh
bun run academy:record -- --lesson parent-categories --native-run /absolute/path/to/finalized-native-run
bun run academy:render -- --lesson parent-categories --run /absolute/path/to/recorded-take --locale ja --font /absolute/path/to/licensed-font.ttc
bun run academy:render -- --lesson parent-categories --run /absolute/path/to/recorded-take --locale en --font /absolute/path/to/licensed-font.ttc
bun tools/academy/publishLesson.ts --ja /absolute/path/to/verified-ja-render --en /absolute/path/to/verified-en-render
```

`--lesson` を表のIDに変えて繰り返します。recordとrenderが出力するtake directoryを次へ渡します。
publishは両言語と現在のscenarioの一致、codec・尺・全フレームdecode・VTT整合を再検査してから
MP4/VTT/poster/manifestを配置します。manifestのasset順はja/enで固定し、公開日はUTCの
実行日、ストア版は両言語のnative-evidenceに一致したinstallation.versionから取得します。
技術検査だけで教材内容の承認にはしません。

この端末のBun 1.3.14では、FFmpeg終了後にレンダーが待機したテイクを観測しました。
同じTypeScriptを指定のNodeへ一時ビルドして編集・検証できます。制作依存は増やしません。
元の失敗takeとログを保持し、成功済みの素材を失敗扱いの素材で上書きしません。

```sh
mkdir -p recordings/academy/node-tools
bun build tools/academy/pipeline/cli.ts --target=node --external '@playwright/test' --external zod --outfile=recordings/academy/node-tools/pipeline.mjs
bun build tools/academy/publishLesson.ts --target=node --external '@playwright/test' --external zod --outfile=recordings/academy/node-tools/publish.mjs
node recordings/academy/node-tools/pipeline.mjs render --lesson parent-categories --run /absolute/path/to/recorded-take --locale ja --font /absolute/path/to/licensed-font.ttc
node recordings/academy/node-tools/publish.mjs --ja /absolute/path/to/verified-ja-render --en /absolute/path/to/verified-en-render
```

## 操作とレビューの境界

保存は本物のnative原本、Domain解説は同じ保存snapshotを別の専用プロファイルで開いた実画面です。
章カードに編集点を示します。整理・復元も別takeで、連続したユーザー操作とは見せません。
reorderだけは最小fixtureを、Learningにstudy/notes、Personalにgardenの状態へ準備します。
原本、trace、アプリデータ、失敗take、font、編集用中間ファイルは `recordings/academy/` に残し、
gitや本番ZIPへ入れません。テスト用ブラウザのプロファイルは終了時に閉じます。

書き込み操作ではページだけを過去日時に固定しません。backgroundと時刻が逆転すると
createdAt / updatedAtの整合性を崩すためです。読み取り解説ではsnapshot以降の固定時刻を使います。
ドラッグ後は実際のプレビューをassertし、内容を読む時間を挟みます。
dnd-kitが終了直後のクリックを短時間抑止するため、即座の確定クリックを連打しません。
操作が字幕の時間枠を超えた場合は収録を失敗とし、scenarioと字幕を見直します。

各章は、導入完了、固定解除、保存後のタブ終了、親子設定・所属・順序、復元結果が映るか、
字幕の誤字・タイミング、画面の切れ、個人データ・認証・別拡張が映っていないかを確認します。
字幕と静的手順を代替にでき、再生は明示操作で開始します。不要な自動再生はありません。

Chrome映像はFirefoxのnativeメニューとして表示しません。Firefoxの代替手順は各章のテキストに
記載し、動画ファイル自体の再生は両ブラウザで検証します。メニューの根拠は
[Chrome公式ヘルプ](https://support.google.com/chrome/answer/2664769?hl=en)と
[Firefox公式ヘルプ](https://support.mozilla.org/en-US/kb/extensions-button)です。
バックアップの最小説明はAcademy一覧の補足と復元章にあります。

## 検証と容量

```sh
bun run test:node tools/academy
bun run e2e e2e/academy-videos.extension.spec.ts e2e/academy-ui.extension.spec.ts --project=extension --workers=1 --list
bun run e2e e2e/academy-videos.extension.spec.ts e2e/academy-ui.extension.spec.ts --project=extension --workers=1
bun tools/academy/verifyPlayback.ts --browser chromium
bun tools/academy/verifyPlayback.ts --browser firefox
```

FirefoxにはPlaywright対応の実行ファイルを準備し、必要なら `FIREFOX_EXECUTABLE_PATH` を指定します。
検証用serverはloopbackで、素材以外の通信を遮断します。macOSでは既存Firefox smokeと同じ
アプリデータ分離helperを使い、`recordings/academy/content-review/` に診断を残します。
Firefox専用のアプリデータは検証後に削除を試みます。保護フォルダ等で削除できない場合は
警告を記録し、ACLを変更せずその診断領域を保持します。Chromium用には作成しません。
Bunの編集待機を避ける場合、verifyPlaybackも同じ `bun build --target=node` で一時生成できます。

総素材容量とZIPサイズ、ブラウザ版、検証結果は[content-result.json](../content-result.json)に記録します。
拡張のインストール時には全素材をZIPで取得します。Academy一覧・テキスト画面ではMP4/VTTを
要求せず、選んだ教材の「動画を読み込む」でsourceを設定し `preload=metadata` とします。
初回のAcademy表示による動画通信は0 byteです。インストールサイズと画面の遅延取得は別の測定です。
