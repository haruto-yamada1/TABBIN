# 配布済み artifact からの更新検証

Chrome Web Store で公開済みの artifact にユーザーデータを書き込み、同じ profile のまま
現在の build へ更新したときに、データが保持されることを release gate で検証します。
対象 Issue: #1014。

## 実行方法

```bash
bun run build
bun run test:production-artifact-upgrade
```

`release:check` と `release:zip` は `release:e2e` 経由でこの command を必須実行します。
通常の PR CI と `quality:check` では browser を起動せず、pin の構造・checksum 検証・
互換性 verifier の unit test だけを常時実行します。

## 固定する配布物

`tools/release/published-artifacts.json` が前回公開版を固定します。

- Chrome: Chrome Web Store の公式 update endpoint から取得する version、extension ID、
  `prodversion`、CRX の SHA-256
- Firefox: 公開済み artifact が存在しないため `excluded` と理由・follow-up を記録

Chrome Web Store が pin より新しい version を返すようになった場合、または CRX の
bytes が変わった場合は version / checksum mismatch として失敗します。公開直後に
pin を更新してください。過去の build を暗黙に使う fallback はありません。

### pin の更新

新しい version を Chrome Web Store へ公開した後、同じ update endpoint から CRX を取得し、
SHA-256 を確認して `version` と `sha256` を更新します。

```bash
curl -fL -o /tmp/tabbin.crx \
  'https://clients2.google.com/service/update2/crx?response=redirect&prodversion=140.0&acceptformat=crx2,crx3&x=id%3Ddljblklbpmoocinnlcejeokopmfoldaj%26uc'
shasum -a 256 /tmp/tabbin.crx
bun run test:production-artifact-upgrade
```

## 検証フロー

1. pin の Chrome Web Store update endpoint から CRX を download する。
2. CRX の SHA-256、CRX header、ZIP entry の安全性、`manifest.json` の version、
   `persistence-release.json` の metadata を検証する。
3. 前回公開 artifact を独立した一時 profile で起動し、IndexedDB と
   `chrome.storage.local` に fixture を書き込む。
4. 同じ profile と extension ID のまま artifact を現在の build に差し替えて再起動する。
5. IndexedDB の全 store snapshot、設定、旧 metadata、画面表示、Backup V2 export を
   assert する。
6. Backup V2 export 後にさらに再起動し、同じ不変条件を再確認する。

profile は `os.tmpdir()` 配下に作成し、実行後に削除します。実際のユーザーデータには
接触しません。download と展開先は `.output/upgrade-artifacts/` です。

## 保証する不変条件

| 対象                      | 検証内容                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------- |
| 保存 URL                  | 全 IndexedDB store の snapshot 一致。URL、title、保存時刻、`isFavorite` を含む      |
| カテゴリ / プロジェクト   | collection、category、membership、`notes`、category 割当の一致                      |
| お気に入り                | IndexedDB の `isFavorite` と、更新後 UI の favorite button `aria-pressed=true`      |
| 設定                      | language、Ollama model、AI system prompt、colors、表示設定、exclude pattern の保持  |
| AI 履歴 / analytics       | conversations、messages、analyticsViews の一致                                      |
| 旧 metadata               | 旧 `chrome.storage.local` control / preflight metadata が変更されず、起動を妨げない |
| Backup V2                 | schemaVersion 2、URL / category / membership notes / favorite / 設定の export 内容  |
| 再起動 / extension ID     | 更新後と Backup V2 export 後の再起動で同じ extension ID とデータを維持              |
| Persistence compatibility | generation 一致、database version の後退なし、candidate が公開版より古くない        |

## 失敗条件

次のいずれかで non-zero exit し、release を失敗させます。skip、warn-only、成功扱いの
fallback はありません。

- artifact の download 失敗、HTTP error、network 断
- SHA-256 checksum mismatch
- CRX header / ZIP の破損、`..` など安全でない ZIP path
- `manifest.json` の version が pin と不一致
- `persistence-release.json` の欠落・不正
- candidate が公開版より古い、persistence generation 不一致、database version 後退
- browser の起動失敗、assertion 失敗、Backup V2 export 失敗

## Chrome / Firefox の検証範囲

| Browser | 状態   | 検証範囲                                                                                           | 除外理由                                                                                                  |
| ------- | ------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Chrome  | 必須   | 公開済み CRX → 現行 build の更新、同じ profile での再起動、上記の全不変条件と Backup V2            | なし                                                                                                      |
| Firefox | 対象外 | fresh / restart / read / write / recovery / Backup V2 は `test:firefox:indexeddb-smoke` で検証済み | AMO に公開済みアドオンがなく、署名済み XPI を配布する `browser_specific_settings.gecko.id` も未整備のため |

Firefox の公開済み artifact が用意できた時点で、同じ pin 形式へ `published` として追加し、
`resolvePublishedArtifact` の Firefox 経路と upgrade smoke を有効化します。それまでは
`excluded` の理由をこの表と pin に明記し、Chrome の成功を Firefox の更新検証成功として
扱いません。

## CI 配置と実測

- `release:check` / `release:zip`: `release:e2e` の最後に必須実行（release 専用）
- 通常 PR CI: unit test のみ。`quality:check` から browser 更新 smoke は起動しない
- 手動: `bun run build && bun run test:production-artifact-upgrade`

2026-11-13 のローカル実測（Chrome 2.0.19 → 2.0.19、macOS）:

- download / checksum / 展開: 約 0.5 秒
- browser 起動・更新・再起動・Backup V2 export: 約 5.9 秒
- 合計: 約 6.5 秒

実行ログの `downloadMs`、`browserMs`、`totalMs` に毎回の実測値が残ります。
