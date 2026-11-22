# TABBIN

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/dljblklbpmoocinnlcejeokopmfoldaj?label=Chrome&logo=google-chrome&style=flat-square)](https://chromewebstore.google.com/detail/tabbin/dljblklbpmoocinnlcejeokopmfoldaj)
[![Chrome Web Store Users](https://img.shields.io/chrome-web-store/users/dljblklbpmoocinnlcejeokopmfoldaj?label=Users&style=flat-square)](https://chromewebstore.google.com/detail/tabbin/dljblklbpmoocinnlcejeokopmfoldaj)
[![Chrome Web Store Rating](https://img.shields.io/chrome-web-store/rating/dljblklbpmoocinnlcejeokopmfoldaj?label=Rating&style=flat-square)](https://chromewebstore.google.com/detail/tabbin/dljblklbpmoocinnlcejeokopmfoldaj)

**TABBIN（タビン）- 次世代のブラウザタブ管理ソリューション**

_散らかりがちなタブを保存・整理し、必要なときにすぐ戻せるローカルファーストのブラウザ拡張機能_

[🚀 Chrome ウェブストアでインストール](https://chromewebstore.google.com/detail/tabbin/dljblklbpmoocinnlcejeokopmfoldaj) ・
[プライバシーとデータの扱い](PRIVACY.md) ・
[サポート / Issues](https://github.com/haruto-yamada1/TABBIN/issues)

## 📋 概要

TABBIN は、開いているタブを保存して閉じ、あとから検索・分類・復元できるブラウザ拡張機能です。保存したタブ、カテゴリ、設定は利用者のブラウザ内に保存され、TABBIN の運営サーバーへ送信されません。

## 📦 配布状況

| ブラウザ | 配布状況 | 導入方法                                                                                                |
| -------- | -------- | ------------------------------------------------------------------------------------------------------- |
| Chrome   | 公開中   | [Chrome ウェブストア](https://chromewebstore.google.com/detail/tabbin/dljblklbpmoocinnlcejeokopmfoldaj) |
| Firefox  | 未公開   | 開発者が[ソースからビルド](#firefox-版をビルドする)して一時的に読み込みます                             |

Firefox 版は AMO（Firefox Add-ons）でまだ公開していません。一般利用者向けの Firefox 配布先は、公開後にこの README へ追記します。

## 🚀 はじめに

### 1. インストールする

Chrome 版は [Chrome ウェブストア](https://chromewebstore.google.com/detail/tabbin/dljblklbpmoocinnlcejeokopmfoldaj) で「Chrome に追加」→ 権限を確認 → 「拡張機能を追加」の順に進めます。インストールすると、保存タブ画面が自動で開きます。

### 2. ツールバーに固定する

Chrome のツールバーにある拡張機能アイコン（パズルピース）をクリックし、TABBIN の横にあるピンアイコンを選びます。TABBIN のアイコンが常に表示され、ワンクリックでタブを保存できるようになります。

### 3. タブを保存する

1. 保存したいタブを開いた状態で、ツールバーの TABBIN アイコンをクリックします。
2. 初期設定では、いま開いているドメインのタブがすべて保存され、保存したタブは閉じられます。
3. 保存範囲は、オプション画面の「拡張機能ボタンをクリックした時の挙動」で「現在のタブ」「ウィンドウのすべてのタブ」「現在のドメインのタブ」「他のウィンドウも含めたすべてのタブ」から変更できます。

保存したタブは保存タブ画面の一覧に残ります。画面を閉じた場合は、任意のページを右クリックして「保存したタブを開く」を選ぶか、TABBIN アイコンを右クリックして「オプション」→ サイドバーの「タブ一覧」を開きます。

### 4. 分類する

保存タブ画面の Domain モードでは、保存した URL がドメインごとに自動でまとまります。

- 親カテゴリを作成し、ドメインを割り当てると、ドメイン単位で整理できます。
- 子カテゴリにはキーワードを設定できます。URL のタイトルにキーワードが含まれると、その子カテゴリへ自動で分類されます。
- 仕事・学習などの単位で分けたい場合は、Custom モードでプロジェクトを作成し、URL をプロジェクトへ移動できます。

### 5. 検索する

保存タブ画面の検索バーに、キーワード、URL、タイトルの一部を入力します。入力に一致する保存タブだけが一覧に残ります。検索をクリアすると全件表示に戻ります。

### 6. 復元する

- 保存した URL をクリックすると、新しいタブで開きます。
- ドメイン、カテゴリ、プロジェクトの「すべて開く」を使うと、まとめて復元できます。
- 既定では、開いた URL は保存一覧から削除されます。一覧に残したい場合は、オプション画面で「保存したタブを開いた後、リストから自動的に削除する」をオフにします。

### 7. バックアップする

オプション画面の「バックアップと復元」から、保存タブ、カテゴリ、プロジェクト、設定、AI Chat 履歴、分析ビューを JSON ファイル（Backup V2）として Export できます。Import は現行の Backup V2 のみ対応し、旧形式のバックアップは受け付けません。Import 前には復旧用スナップショットが IndexedDB に保存されます（最大 2 件、7 日間）。

## ✨ 主な機能

- **タブの一括保存** - 現在のタブ、ウィンドウ内のタブ、同じドメインのタブ、すべてのウィンドウのタブから選んで保存できます。保存したタブは閉じられ、一覧に残ります。
- **ドメイン別の自動整理** - 保存した URL をドメインごとに自動でまとめます。
- **親子カテゴリ** - ドメインを親カテゴリに割り当て、子カテゴリにはキーワードを設定できます。タイトルに一致した URL は自動で子カテゴリに分類されます。
- **カスタムモード / プロジェクト** - 仕事・学習などのプロジェクト単位で URL を整理できます。
- **検索** - キーワード、URL、タイトルから保存したタブを絞り込めます。
- **復元** - 保存した URL をクリックするか、「すべて開く」でまとめて開けます。
- **お気に入り** - よく使う URL をお気に入りにして、カテゴリ内の先頭に表示できます。
- **自動削除** - 設定した期間を過ぎたタブを自動的に整理します。ピン留めタブを保護する設定もあります。
- **右クリックメニュー** - ページの右クリックから、現在のタブやウィンドウ内のタブを保存できます。
- **バックアップと復元（Backup V2）** - 保存タブ、カテゴリ、プロジェクト、設定、AI Chat 履歴、分析ビューを JSON で Export / Import できます。
- **ローカル AI Chat（任意）** - ローカルの Ollama と接続し、保存したタブについて質問できます。Ollama を使わない場合は、通常のタブ管理機能だけを利用できます。
- **分析** - 保存したタブの傾向をグラフと要約で確認できます。
- **保存済みマーク（任意）** - 保存済みのページタイトルに `✓ ` を付けて、ページ上で保存済みかどうかを確認できます。初期状態はオフです。

## 🔐 データの保存とプライバシー

- 保存タブ、URL、カテゴリ、プロジェクト、AI Chat の会話履歴、保存した分析ビューは、ブラウザ内の IndexedDB に保存します。
- 利用者設定、選択中の AI 会話、テーマ、changelog の表示状態などは `chrome.storage.local` に保存します。サイドバーの幅など一部の UI 状態は、拡張機能ページのローカルストレージを使います。
- TABBIN は、保存データを TABBIN 管理の外部サーバーや広告ネットワークへ送信しません。
- AI Chat は任意機能です。利用する場合、prompt、会話履歴、添付したテキストまたは画像、保存タブから作成した文脈が、`http://localhost:11434` または `http://127.0.0.1:11434` のローカル Ollama へ送られることがあります。Ollama をリモートホストやプロキシへ転送する設定にしている場合の扱いは、利用者の Ollama 環境に従います。
- 保存済みマークなどの任意機能を有効にした場合のみ、追加のサイトアクセス権限を要求します。初期状態はオフで、ブラウザの拡張機能設定から権限を撤回できます。

データの種類、保存先、保持期間、権限の一覧は [PRIVACY.md](PRIVACY.md) を参照してください。2.0.18 以降の保存先は IndexedDB に一本化されています。旧バージョンからのデータ移行の扱いは [IndexedDB 一本化のリリースノート](docs/releases/indexeddb-only-persistence.md) を参照してください。

## 🧪 開発版の機能

`develop` ブランチで開発中で、次回以降のストア更新に含まれる機能です。現在のストア版ではまだ利用できません。

- **Academy** - アプリ内の「Academy」で、インストール、アイコンの固定、タブ保存、カテゴリ整理、復元を短い動画と操作ガイドで学べます。
- **リンクの矩形選択保存** - 設定したキー＋左ドラッグでページ上のリンクをまとめて選択し、タブを開かずに保存できます。
- **お気に入りの自動削除保護** - お気に入りにした URL を自動削除の対象外にできます。

## 🛠️ 開発者向け情報

### Firefox 版をビルドする

Firefox 版は AMO で未公開のため、一般向けのインストール先はまだありません。開発者は次の手順でビルドし、Firefox Developer Edition などの一時読み込みで確認できます。

```bash
bun install --frozen-lockfile
bun run build:firefox
```

1. Firefox で `about:debugging#/runtime/this-firefox` を開きます。
2. 「一時的なアドオンを読み込む」から `.output/firefox-mv2/manifest.json` を選びます。

一時的に読み込んだアドオンは、Firefox を再起動すると解除されます。自動テストで profile に直接配置する場合は、未署名アドオンを許可する Developer Edition、Nightly、Unbranded build のいずれかを使用してください。配布手順は [docs/release.md](docs/release.md#firefox-アドオンへの公開) を参照してください。

### 開発コマンド

```bash
bun install             # 依存関係のインストール
bun run dev             # Chrome 向け開発モード
bun run dev:firefox     # Firefox 向け開発モード
bun run test            # unit / integration テスト
bun run quality:check   # format / lint / typecheck / test などの品質ゲート
bun run release:check   # 配布前の品質・ビルド・E2E チェック
bun run release:zip     # release:check → Chrome / Firefox の ZIP 生成
```

テスト実行コマンドの使い分けは [AGENTS.md](AGENTS.md) を参照してください。

### ドキュメント

- [アーキテクチャ（DDD）](docs/architecture/ddd.md)
- [リリース手順](docs/release.md)
- [Firefox smoke test](docs/testing/firefox-smoke.md)
- [Academy fixture README](tools/academy/README.md)

## 📞 サポート

- 不具合報告・機能要望: [GitHub Issues](https://github.com/haruto-yamada1/TABBIN/issues)
- その他のお問い合わせ: [お問い合わせフォーム](https://forms.gle/c9gBiF2TmgXaeU7J6)

Issue を作成する前に、既存の Issue に同じ問題がないか確認してください。保存データの扱いについては [PRIVACY.md](PRIVACY.md) を参照してください。

## English

TABBIN is a local-first browser extension that saves, organizes, and restores tabs.

- Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/tabbin/dljblklbpmoocinnlcejeokopmfoldaj).
- Data handling: [PRIVACY.md](PRIVACY.md).
- Support: [GitHub Issues](https://github.com/haruto-yamada1/TABBIN/issues) or the [contact form](https://forms.gle/c9gBiF2TmgXaeU7J6).

Firefox builds are not published on AMO yet. See [Build the Firefox version](#firefox-版をビルドする) for the developer preview steps.
