# IndexedDB への保存先一本化（次回リリースの互換性変更）

Issue [#861](https://github.com/haruto-yamada1/TABBIN/issues/861) の変更を含む
リリースでは、保存タブ、Custom Project、カテゴリ、AI 会話履歴、Analytics Views を
IndexedDB から読み書きします。

すでに IndexedDB に移行済みのデータとユーザー設定は保持されます。Backup V2 の
import/export、DB schema upgrade、整合性検査、import 前の recovery snapshot と復元も
引き続き利用できます。

**まだ IndexedDB に移行していない古いバージョンの利用者には互換性の変更があります。**
更新時に、端末内の旧 Chrome Storage ドメインデータを自動移行・復元しません。
IndexedDB にデータがない場合、保存一覧は空の状態で起動します。旧キーそのものの
物理削除はこの変更では行いません。

設定、テーマ、AI の選択中会話 ID、changelog 表示状態には引き続き Chrome Storage を
使用します。storage permission も維持します。

この変更は端末内の旧データ自動移行の終了です。旧 pre-IndexedDB backup import の
サポート終了は [#734](https://github.com/haruto-yamada1/TABBIN/issues/734) で扱った
別の変更です。現在サポートされるバックアップ形式は Backup V2 です。

## English

The release containing Issue #861 uses IndexedDB for saved tabs, projects,
categories, AI conversation history, and analytics views. Existing IndexedDB
records and user settings are preserved, along with Backup V2 import/export,
database schema upgrades, integrity checks, and pre-import recovery snapshots.

Users who have not yet migrated from an older version lose automatic migration
of on-device Chrome Storage domain data. That old data is neither restored into
an empty database nor physically deleted by this change. An empty IndexedDB
database starts with an empty saved list. Settings, theme, selected conversation
ID, and changelog state continue to use Chrome Storage.
