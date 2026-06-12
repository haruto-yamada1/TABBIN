---
name: update-cli-config
description: Cursor CLI の configuration（~/.cursor/cli-config.json）を表示・変更します。CLI setting 変更、permission 設定、approval mode 切替、vim mode 有効化、display option 切替、sandbox 設定、その他 CLI preference 管理時に使います。
metadata:
  surfaces:
    - cli
---
# Cursor CLI 設定

`~/.cursor/cli-config.json` に保存される Cursor CLI setting の表示・変更手順です。

## Config File Location

config file は `~/.cursor/cli-config.json` です。

project は `.cursor/cli.json` で override を layer できます。CLI は git root から current working directory まで walk し、見つかった各 `.cursor/cli.json` を merge します（深い file が優先）。project override は現在の session にのみ影響し、home config には書き戻されません。

## 変更方法

`~/.cursor/cli-config.json` を読み、変更を適用し、書き戻します。file は standard JSON です。変更は CLI restart 後に有効になります。

## Available Settings

### `permissions` (required)
tool permission rule。各 entry は string pattern。
- `allow`: string[] — 許可する tool call の pattern（例: `"Shell(**)"`, `"Mcp(server-name, tool-name)"`）
- `deny`: string[] — 拒否する tool call の pattern

### `editor`
- `vimMode`: boolean — CLI input で vim keybinding を有効化
- `defaultBehavior`: `"ide"` | `"agent"` — 既定 behavior mode

### `display` (optional)
- `showLineNumbers`: boolean (default: false) — code output に line number を表示
- `showThinkingBlocks`: boolean (default: false) — model thinking/reasoning block を表示
- `showStatusIndicators`: boolean (default: false) — UI に status indicator を表示

### `channel` (optional)
release channel: `"prod"` | `"staging"` | `"lab"` | `"static"`

### `maxMode` (optional)
boolean (default: false) — 高品質 model response のため max mode を有効化

### `approvalMode` (optional)
tool approval behavior を制御:
- `"allowlist"` (default) — allow list にない tool は approval 必須
- `"unrestricted"` — すべての tool call を auto-approve（yolo mode）

### `sandbox` (optional)
sandbox 実行環境 setting:
- `mode`: `"disabled"` | `"enabled"` (default: `"disabled"`)
- `networkAccess`: `"user_config_only"` | `"user_config_with_defaults"` | `"allow_all"` — sandbox からの network access を制御
- `networkAllowlist`: string[] — sandbox が到達可能な domain

### `network` (optional)
- `useHttp1ForAgent`: boolean (default: false) — agent connection に HTTP/2 の代わり HTTP/1.1 を使用（SSE-based streaming を有効化）

### `bedrock` (optional)
AWS Bedrock integration setting:
- `enabled`: boolean (default: false)
- `mode`: `"access-key"` | `"team-role"` (default: `"access-key"`)
- `region`: string — AWS region
- `testModel`: string — テスト用 model
- `teamRoleArn`: string — team mode 用 IAM role ARN
- `teamExternalId`: string — STS assume-role 用 external ID

### `attribution` (optional)
agent 作業の git attribution を制御:
- `attributeCommitsToAgent`: boolean (default: true) — commit を agent に attribute
- `attributePRsToAgent`: boolean (default: true) — PR を agent に attribute

### `webFetchDomainAllowlist` (optional)
string[] — web fetch tool が access 可能な domain（例: `"docs.github.com"`, `"*.example.com"`, `"*"`）

## 手動変更してはいけない Field

internal/cached state のため手動編集しないでください:
- `version` — config schema version
- `model` / `selectedModel` / `modelParameters` / `hasChangedDefaultModel` — model picker が管理
- `privacyCache` — cached privacy mode state
- `authInfo` — cached authentication info
- `showSandboxIntro` — one-time UI flag
- `conversationClassificationScoredConversations` — internal cache
