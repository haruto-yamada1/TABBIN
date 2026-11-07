# ADR 0004: Academy の実ブラウザ録画をページ動画とネイティブ原本に分ける

- 状態: 採用（Chromium 系の録画 PoC。全 OS の完全自動化は保証しない）
- 日付: 2026-11-07
- 関連: #998、#997、#999、#919

## 背景

Academy の導入教材では、公開ストアからのインストール、拡張機能のピン固定、
実アイコンのクリックによるタブ保存・終了・Domain 表示を見せる必要がある。
Web ページの DOM 操作や viewport の録画だけでは、ブラウザのツールバーと導入確認
ダイアログを記録できない。別実装のツールバーや模擬保存の画面は教材の証拠にならない。

#997 の最小 manifest は3 hostname・6 URLを宣言している。保存済み snapshot を
seed して一覧だけを映す既存ツールは、実タブを保存して閉じた証拠にはならない。
今回の PoC は実ユーザーのプロファイル、保存データ、認証、他の拡張機能を使わずに
実際のブラウザ操作を検証する。

## 決定

`tools/academy/recording/run.ts` は毎回新しい一時プロファイルを所有する。
`chrome-web-store` は公式ページからの本当の導入を待ち、ストア ID・版・導入種別を
記録する。`unpacked-development` は Playwright による展開拡張の読み込みとして
明確に分け、ストア導入の証拠として扱わない。

撮影準備と期待値検査は Playwright、ツールバー・固定メニュー・導入確認の実操作は
OS の GUI 操作または人の操作、原本収録は OS の録画を使用する。Playwright の
`recordVideo` は実 TABBIN ページの診断用であり、ネイティブ原本を代替しない。

保存の撮影では実 Options で `saveWindowTabs` を選択して記録する。現行の既定値は
`saveSameDomainTabs` なので、この変更を省略した説明はしない。保存データが空である
ことを確認し、manifest の6 URLへ共通 HTML を返して実タブを開く。TABBIN の本物の
保存処理を呼ぶのは、ブラウザの固定済みアイコンのクリックだけである。

検証は元の全タブ ID の消失、保存 URL の完全一致、hostname ごとの Domain と
membership、実 Saved Tabs DOM、アクティブな Domain 画面1タブへの遷移を要求する。
保存済みデータを注入したり、拡張 API からツールバークリックを擬装したりしない。

## 実測と OS の境界

2026-11-07 の macOS 27.2、Playwright 同梱の Google Chrome for Testing で、公開
ストア版 TABBIN 2.0.19（公式 ID、`installType: normal`）の導入と、3 hostname・
6 URL の実保存、元タブの終了、Domain 表示を確認した。ストアの「Chrome に切り替え」
バナーはそのまま表示される。この環境で導入できたことを、他の Chromium build でも
導入可能である保証にはしない。

標準 Chrome の native AX 取得は timeout し、macOS の録画 UI 再起動もエラー162で
失敗した。明示的に選択した代替方式として、OS 標準 `screencapture -v -l<windowID>`
で専用ウィンドウだけを収録できた。生成した MOV をデコードし、ツールバーと本物の
権限確認ダイアログが含まれることを確認した。対話的なウィンドウ選択は実測で完了
しなかったため、正確なタイトルに一致する一意の対象 ID を確認して指定した。

最初の sandbox 内の起動・録画失敗は権限付きの同じ操作で切り分けた。sandbox の
失敗を OS 全体の利用不可と判断せず、ブラウザの保護設定や品質条件は弱めない。
ウィンドウ ID は再起動時に変わるため撮影直前に取り直す。特定 OS の座標、AX tree、
メニュー名は portable な自動化契約に含めない。

## 証跡と成功条件

CLI の `finish` はブラウザを閉じて一時プロファイルを削除し、結果を
`pending-native-evidence` とする。保存フローの成功だけで動画成功にはしない。
原本と操作ログ、失敗画像、前後の機械可読 snapshot は run ごとに保持する。
失敗テイクは成功クリップとして出力せず、別名の原本と失敗理由を残して撮り直す。

担当者は導入・固定・保存の3工程を再生確認し、本物の UI と必要な操作が映り、
個人データ・認証・別拡張が映っていないことを `native-review.json` に明示する。
`finalize.ts` はストア導入・保存結果を再検証し、原本の存在、ディレクトリ内の
相対 path、最低限のコンテナヘッダ、SHA256、工程別レビューを検査する。
ヘッダや hash は意味内容やデコーダーの成功を保証しないため、再生レビューは必須。
成功時だけ `final-result.json` を新規作成する。失敗履歴を保持して再試行できる。

原本と private な run 証跡は `recordings/academy/` に保存し、git・本番 WXT ZIP に
含めない。共有用の検証記録には環境、判定、原本名・hash、必要な操作だけを記載し、
個人のプロファイル path や認証情報を載せない。

## フォールバックと教材への影響

完全自動化が成立しなくても、専用プロファイルで人が行った本物のネイティブ操作を
収録できる。これと同じ実 TABBIN 画面の Playwright ページ動画を、工程と編集点を
明示して継ぐ。開発版の読み込みをストア導入として見せず、失敗した操作を合成 UI で
成功に置き換えない。初回撮影・再生レビューには1テイク約5〜10分の手作業を見込む。

固定の字幕では、アイコンをツールバーへ常時表示する意味と、同じピンをもう一度押す
解除方法を説明する。Chrome/Chromium 専用の操作としてブラウザ名を示す。
Firefox のストア導入・固定方法は別の素材として検証・撮影し、Chrome 動画を
Firefox 共通 UI として表示しない。Windows/Linux の native 自動化と録画も別途検証する。

この判断は #999 以降の動画制作方式を定めるもので、全8レッスンの制作、学習進捗、
Joyride、アプリ本体の UI・保存形式・追加権限は変更しない。

## 参照と rollback

- [Playwright: Chrome extensions](https://playwright.dev/docs/chrome-extensions)
- [Playwright: Videos](https://playwright.dev/docs/videos)
- [起動・撮影・再検査の手順](../../tools/academy/recording/README.md)

rollback はこの撮影ツールと手順の撤回で完結する。実ユーザーのデータ移行は不要。
