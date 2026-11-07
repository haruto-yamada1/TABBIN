# Academy 撮影・E2E 用 fixture

このディレクトリは開発・動画撮影・E2E 専用です。TABBIN の実際の React UI を、
テスト / 録画ごとに生成する使い捨て Chromium プロファイルで開きます。通常利用中の
Chrome / Firefox プロファイル、保存タブ、IndexedDB、閲覧履歴は使用しません。
ユーザー向け Academy / Joyride へ fixture を投入する機能はありません。

## シナリオ

`createAcademyFixture('minimal')` は `fixture.ts` の TypeScript manifest から、
固定 seed `academy-997-v1` と固定保存日時で毎回新しい snapshot を生成します。
乱数、現在時刻、外部サービス、API キー、CDN、実ブランドに依存しません。

| hostname              | URL 数 | 親カテゴリ | 子カテゴリ         |
| --------------------- | -----: | ---------- | ------------------ |
| `study.filming.test`  |      2 | Learning   | Guides / Reference |
| `notes.filming.test`  |      2 | Personal   | Ideas / 未分類     |
| `garden.filming.test` |      2 | 未分類     | 未分類             |

`createAcademyFixture('empty')` は URL・カテゴリのない空シナリオです。
大量タブシナリオは、具体的な撮影・負荷検証で必要になった時に独立した選択肢として
追加してください。最小シナリオを恒常的に 30 サイト / 40 タブへ拡張しません。

URL は予約済み `.test` hostname を持つ保存データです。DNS / ローカルサーバは不要で、
外部サイトへの移動を前提にしません。表示・カテゴリ編集・並べ替え等を撮影できます。
URL を開く・実タブを保存する撮影が必要なら、テスト側で許可 URL と共通 HTML の
レスポンスを明示してください。localhost の異なる path だけでは Domain は分かれません。

## E2E と reset

リポジトリ root で依存関係を `bun install --frozen-lockfile` により準備します。
Playwright の Chromium が利用可能な環境で実行してください。

```sh
bun run test:node tools/academy
bun run e2e e2e/academy-fixtures.extension.spec.ts --project=extension --workers=1 --list
bun run e2e e2e/academy-fixtures.extension.spec.ts --project=extension --workers=1
```

既存 `e2e/helpers/extension.ts` が起動する一時プロファイルにだけ
`resetAcademyFixture` を使用します。余ったブラウザタブを閉じ、実 UI をいったん
離れてから、既存の `seedSavedTabsFixture` で設定と保存 URL・Domain・親子カテゴリを
置換し、実 Saved Tabs を開き直します。E2E は最小 → 空 → 最小の反復と、前回タブの
除去、各ストアの完全な一致、同一 hostname の URL のまとまりを検証します。

この reset は保存タブの撮影状態用です。その他の IndexedDB ストアを含む完全な
初期化は、撮影コマンドを終了して再実行し、新しい一時プロファイルで行います。
Firefox で同じデータを使うテストを追加する場合も、既存の Firefox 専用一時
プロファイル helper を使ってください。通常プロファイルへの接続引数は追加しません。

## 撮影

```sh
bun run build
bun tools/academy/record.ts --scenario minimal
```

専用の Chromium ウィンドウで実 Saved Tabs を開き、WebM の録画を開始します。
操作後に起動したターミナルで Enter を押すか、そのテストブラウザを閉じると録画を
終了し、ブラウザと一時プロファイルを削除します。保存された動画の絶対 path を
ターミナルに表示します。動画には初期表示までの準備部分も含まれます。
撮影し直す際は同じコマンドを再実行してください。

空の状態は `--scenario empty`、指定秒数での自動終了は `--seconds 3` で選べます。
対話 terminal がない場合は `--seconds` が必須です。通常プロファイルの path を
指定する option はありません。録画は `recordings/academy/`、E2E の screenshot は `test-results/` 以下に
保存され、commit しません。録画は後の E2E 実行で削除されない専用 directory に残します。録画は Chrome 向けで、Firefox の録画 launcher は含みません。

## 本番への混入検査

fixture と撮影 helper は WXT の `srcDir` / `publicDir` の外に置き、アプリから
import しません。`tools/academy/` と `e2e/` は source ZIP の includeSources にも
含まれません。build / ZIP 生成後に、展開済み成果物と ZIP 内容を検査できます。

```sh
bun run zip
bun run zip:firefox
bun tools/academy/verifyArtifacts.ts .output/chrome-mv3 .output/firefox-mv2 .output/*.zip
```

検査は fixture の ID / hostname と撮影専用ファイルの path を検出したら失敗します。
入力の指定漏れ・ファイル不足・不正 ZIP も失敗扱いです。新しいシナリオでは
manifest と検査用 marker を一緒に見直してください。ビルド検証と Firefox の
実機 smoke は別です。Firefox smoke の前提は `bun run verify:firefox-smoke-environment`
で確認します。
