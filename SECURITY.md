# セキュリティポリシー

TABBIN は、開いているタブを保存・整理・復元するローカルファーストのブラウザ拡張機能です。保存データを TABBIN 管理のサーバーへ送信しませんが、拡張機能の権限、メッセージング、保存データの扱いにはセキュリティ上の影響があり得ます。脆弱性の可能性を見つけた場合は、修正される前に公開しないようお願いします。

## 脆弱性を非公開で報告する

脆弱性の詳細は、GitHub の非公開 Security Advisory から報告してください。

- 報告フォーム: <https://github.com/haruto-yamada1/TABBIN/security/advisories/new>
- リポジトリの **Security** タブ → **Report a vulnerability** からも開けます。
- 報告内容はメンテナーと報告者だけが閲覧できます。GitHub アカウントが必要です。

公開 Issue、Pull Request、Discussion、問い合わせフォームには、脆弱性の詳細を書かないでください。再現手順や影響を受けるデータを公開の場に置くと、修正前でも第三者に利用されます。

GitHub の非公開報告を使えない場合は、詳細を含まない最小限の公開 Issue で「非公開で連絡できる手段がほしい」とだけ伝えてください。再現手順、URL、ログ、スクリーンショットは、非公開の連絡手段ができるまで送らないでください。

### 報告に含めてほしい情報

- 影響を受ける TABBIN のバージョン（例: Chrome ウェブストア版 2.0.19）
- ブラウザとバージョン、OS
- 再現手順と、期待する動作 / 実際の動作
- 想定される影響（何ができるか、どの保存データや権限に触れるか）
- 可能であれば最小の再現コードや PoC
- 修正案、公開時期の希望、クレジットの希望（任意）

### 送らないでほしいデータ

報告には、実際の保存 URL、閲覧履歴、ブックマーク、アカウント情報を含めないでください。

- API キー、トークン、Cookie、パスワード、Ollama やプロキシの認証情報を貼らないでください。
- 実在する第三者のデータや、業務で利用している URL を使わないでください。
- 個人情報を含むスクリーンショットは、マスクするか撮り直してください。
- 検証は、自分が管理する Chrome または Firefox の新規プロファイルで行ってください。拡張機能のデータを削除すれば、保存タブや設定も削除できます。
- 添付ファイルは Security Advisory の中だけに置き、外部のファイル共有サービスへアップロードしないでください。
- 受領した情報は脆弱性の確認と修正のためにのみ使い、公開前に報告者と調整します。法令上必要な場合を除き、報告者の同意なく個人情報を公開しません。

## サポート対象バージョン

| 区分                             | 対象                                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 最新の Chrome ウェブストア版     | サポート対象。セキュリティ修正を提供します。                                                             |
| `develop` の最新ビルド           | サポート対象（開発版）。修正はここへ先に入ります。                                                       |
| それ以前の Chrome ウェブストア版 | サポート対象外。ストアの自動更新で最新版へ更新してください。影響が大きい場合は個別に確認します。         |
| Firefox 版                       | 未公開のため、ソースからビルドした開発版をサポート対象とします。AMO で公開した後は最新版を対象にします。 |
| 改変版、フォーク、再パッケージ   | サポート対象外。                                                                                         |

「サポート対象」は、セキュリティ修正を受け取れる範囲を示します。すべての旧バージョンへ個別の修正版を配布する意味ではありません。

## 対象となる問題

- 拡張機能のコード、manifest、権限要求、CSP、ホスト権限
- 拡張機能ページ、background、content script 間のメッセージング境界
- IndexedDB と `chrome.storage.local` の保存・読み込み、旧データの扱い
- Backup V2 の Export / Import と復旧用スナップショット
- AI Chat のローカル Ollama 連携境界と、保存タブから生成する文脈
- 保存済みマークなど、任意で有効にするページアクセス
- TABBIN から到達できる依存関係の脆弱性
- 上記を経由した個人情報の意図しない漏えい

## 対象外

- 利用者が自分で動かす Ollama、モデル、プロキシ、LAN 設定
- Chrome ウェブストア、GitHub、Firefox Add-ons など外部サービスの問題
- ソーシャルエンジニアリング、フィッシング、端末への物理アクセス
- 拡張機能を導入していない状態のブラウザ設定
- 再現手順のない自動スキャン結果の一括送信
- 既に公開されている情報で、TABBIN に影響がないもの

対象外と判断した場合も、判断理由を返します。TABBIN に影響する可能性がある場合は、対象外を理由に報告を破棄しません。

## 対応の流れと目安

| 段階       | 内容                                           | 目安               |
| ---------- | ---------------------------------------------- | ------------------ |
| 受付       | 報告を確認し、受領を返信                       | 7 日以内           |
| トリアージ | 再現、影響範囲、深刻度を確認し、追加情報を依頼 | 14 日以内          |
| 方針共有   | 修正、緩和、非該当のいずれかを共有             | 30 日以内          |
| 修正と検証 | 回帰テストを追加し、品質ゲートを通す           | 影響度に応じて優先 |
| 配布       | Chrome ウェブストアの審査を経て更新            | 審査状況により変動 |
| 公開       | 修正版の配布後に Security Advisory を公開      | 報告者と調整       |

これらは目安であり、応答や修正完了を保証しません。少人数で維持しているため、調査に時間がかかる場合があります。深刻度が高い問題は可能な限り早く対応し、状況が変わった場合は共有します。

## 開示の方針

- 修正版を配布してから、GitHub Security Advisory を公開します。
- 公開の時期と内容は報告者と調整します。希望があれば、報告者名またはハンドルをクレジットします。
- 修正が長期化する場合は、影響と緩和策を共有したうえで、公開時期を個別に相談します。
- すでに悪用が確認されているなど、早急な注意喚起が必要な場合は、修正前でも限定的な情報を公開することがあります。その場合も、未修正の再現手順は公開しません。

## 通常の不具合との違い

- 機能の不具合、クラッシュ、表示崩れ、データ移行の失敗など、セキュリティに影響しない問題は [Bug Report](.github/ISSUE_TEMPLATE/bug_report.yml) から公開 Issue で報告してください。
- セキュリティに影響するか判断できない場合は、まず非公開で報告してください。公開 Issue へ書いてしまった場合は、詳細を追加せず、メンテナーへ非公開の連絡手段を求めてください。

## メンテナー向けの運用

このリポジトリでは GitHub の Private vulnerability reporting を有効にしています。設定と受付状態は次のコマンドで確認できます。

```sh
gh api repos/haruto-yamada1/TABBIN/private-vulnerability-reporting
```

- 設定場所: Settings → Code security → Private vulnerability reporting
- 受付フォーム: Security → Advisories → Report a vulnerability
- 受付を無効化すると、Security タブの報告導線が消えます。無効化する場合は、代わりの非公開窓口を先に用意し、この文書と README を更新してください。
- 受領した報告は Security Advisory の draft で追跡し、修正版のリリース後に公開します。
- 依存関係だけの問題は[依存更新ポリシー](docs/maintenance/dependency-updates.md)と [Dependency Review](docs/maintenance/dependency-review.md) の手順も使います。

## 関連文書

- [CodeQL code scanning](docs/security/code-scanning.md)
- [Chrome extension permissions](docs/security/permissions.md)
- [Messaging trust boundary](docs/security/messaging-trust-boundary.md)
- [Production outbound network policy](docs/security/production-network-policy.md)
- [プライバシーとデータの扱い](PRIVACY.md)

## English summary

TABBIN is a local-first browser extension. Report vulnerabilities privately through
[GitHub private vulnerability reporting](https://github.com/haruto-yamada1/TABBIN/security/advisories/new).
Do not post reproduction steps, secrets, or real user data in a public issue, pull
request, or the contact form. Supported versions are the latest Chrome Web Store
release and the latest `develop` build; older releases, Firefox builds without a
published release, and modified builds are not supported. Response times in this
document are targets, not guarantees. The full policy is written in Japanese above.
