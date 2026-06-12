---
name: update-cursor-settings
description: Cursor/VSCode の user settings（settings.json）を変更します。editor 設定、preferences、configuration、theme、font size、tab size、format on save、auto save、keybinding、その他 settings.json の値を変更したいときに使います。
metadata:
  surfaces:
    - ide
---
# Cursor 設定の更新

Cursor/VSCode user settings 変更の手順です。editor 設定、preferences、configuration、theme、keybinding、その他 `settings.json` の値を変更するときに使います。

## Settings File Location

| OS | Path |
|----|------|
| macOS | ~/Library/Application Support/Cursor/User/settings.json |
| Linux | ~/.config/Cursor/User/settings.json |
| Windows | %APPDATA%\Cursor\User\settings.json |

## 変更前の確認

1. **既存 settings file を読む** — 現在の configuration を把握
2. **既存 settings を保持** — ユーザーが依頼した項目だけ add/modify
3. **JSON syntax を validate** — editor を壊さないよう書き込み前に確認

## Settings の変更

### Step 1: 現在の Settings を読む

```typescript
// Read the settings file first
const settingsPath = "~/Library/Application Support/Cursor/User/settings.json";
// Use the Read tool to get current contents
```

### Step 2: 変更する Setting を特定

よくある setting カテゴリ:
- **Editor**: `editor.fontSize`, `editor.tabSize`, `editor.wordWrap`, `editor.formatOnSave`
- **Workbench**: `workbench.colorTheme`, `workbench.iconTheme`, `workbench.sideBar.location`
- **Files**: `files.autoSave`, `files.exclude`, `files.associations`
- **Terminal**: `terminal.integrated.fontSize`, `terminal.integrated.shell.*`
- **Cursor-specific**: `cursor.` または `aipopup.` で始まる setting

### Step 3: Setting を更新

settings.json 変更時:
1. 既存 JSON を parse（comment 対応 — VSCode settings は JSON with comments）
2. 依頼された setting を add または update
3. 他の既存 setting はすべて保持
4. 適切な formatting（2-space indent）で書き戻す

### Example: Changing Font Size

「font を大きくして」と言われた場合:

```json
{
  "editor.fontSize": 16
}
```

### Example: Enabling Format on Save

「save 時に format して」と言われた場合:

```json
{
  "editor.formatOnSave": true
}
```

### Example: Changing Theme

「dark theme にして」「theme を変えて」と言われた場合:

```json
{
  "workbench.colorTheme": "Default Dark Modern"
}
```

## 重要な注意点

1. **JSON with Comments**: VSCode/Cursor settings.json は comment（`//` と `/* */`）をサポートします。読み取り時は comment がある可能性に注意。書き込み時は可能なら comment を保持します。

2. **Restart が必要な場合あり**: 一部 setting は即時反映、他は window reload または Cursor restart が必要です。restart が必要ならユーザーに伝えます。

3. **Backup**: 大きな変更の場合、settings file で Ctrl/Cmd+Z、または git で tracked なら revert できることを伝えてもよいです。

4. **Workspace vs User Settings**:
   - User settings（この skill の対象）: すべての project に global 適用
   - Workspace settings（`.vscode/settings.json`）: 現在の project のみ適用

5. **Commit Attribution**: commit attribution について聞かれた場合、**CLI agent** と **IDE agent** のどちらかを確認します。CLI agent の場合は `~/.cursor/cli-config.json` を変更。IDE agent は **Cursor Settings > Agent > Attribution**（settings.json ではない）から制御します。

## よくある依頼 → Settings

| User Request | Setting |
|--------------|---------|
| "bigger/smaller font" | `editor.fontSize` |
| "change tab size" | `editor.tabSize` |
| "format on save" | `editor.formatOnSave` |
| "word wrap" | `editor.wordWrap` |
| "change theme" | `workbench.colorTheme` |
| "hide minimap" | `editor.minimap.enabled` |
| "auto save" | `files.autoSave` |
| "line numbers" | `editor.lineNumbers` |
| "bracket matching" | `editor.bracketPairColorization.enabled` |
| "cursor style" | `editor.cursorStyle` |
| "smooth scrolling" | `editor.smoothScrolling` |

## ワークフロー

1. ~/Library/Application Support/Cursor/User/settings.json を読む
2. JSON content を parse
3. 依頼された setting を add/modify
4. 更新した JSON を file に書き戻す
5. setting が変更されたこと、reload が必要かどうかをユーザーに伝える
