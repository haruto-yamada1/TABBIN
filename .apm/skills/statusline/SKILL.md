---
name: statusline
disable-model-invocation: true
description: Claude Code / Cursor CLI 専用。CLI の custom status line を設定します。status line、statusline、statusLine、CLI status bar、prompt footer のカスタマイズ、prompt 上への session context 追加を依頼されたときに使います。Codex / Gemini など status line 機能のないクライアントでは実行せず、該当クライアントの機能がない旨を伝えます。
---
# CLI status line（Claude Code / Cursor CLI 専用）
> **対応クライアント:** Claude Code と Cursor CLI のみ。Codex / Gemini などに status line 機能はないため、これらのクライアントではこの skill を実行せず「該当機能がありません」と伝えます。

CLI は prompt 上に user-configurable な status line を表示できます。conversation 更新のたびに command が spawn され、stdin で session を記述する JSON payload を受け取り、stdout が status line として表示されます。spec は [Claude Code's status line](https://code.claude.com/docs/en/statusline) に整合しています。

## Configuration

`~/.cursor/cli-config.json` に `statusLine` entry を追加:

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.cursor/statusline.sh",
    "padding": 2
  }
}
```

`command` field は full path、`~` expansion、shell-style argument splitting をサポート。script file を指すか、inline command（例: `jq -r '...'`）も使えます。

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `type` | yes | — | `"command"` であること |
| `command` | yes | — | executable path または inline command。`~` は expand される |
| `padding` | no | `0` | status line container の horizontal inset（文字数） |
| `updateIntervalMs` | no | `300` | invocation 間の最小 interval。>= 300ms に clamp |
| `timeoutMs` | no | `2000` | command の最大実行時間。超過で kill |

## Stdin payload

command は stdin で JSON object を受け取ります。TypeScript interface は `packages/agent-cli/src/hooks/use-status-line.ts` の `StatusLinePayload` です。

### Full JSON schema

```json
{
  "session_id": "abc123",
  "session_name": "my session",
  "transcript_path": "/path/to/transcript.jsonl",
  "render_width_chars": 120,
  "cwd": "/Users/<user>/project",
  "model": {
    "id": "claude-4-opus",
    "display_name": "Claude 4 Opus",
    "param_summary": "(Thinking)",
    "max_mode": true
  },
  "workspace": {
    "current_dir": "/Users/<user>/project",
    "project_dir": "/Users/<user>/project/.cursor/transcripts",
    "added_dirs": []
  },
  "version": "1.2.3",
  "output_style": {
    "name": "default"
  },
  "context_window": {
    "total_input_tokens": 15234,
    "total_output_tokens": null,
    "context_window_size": 200000,
    "used_percentage": 34.5,
    "remaining_percentage": 65.5,
    "current_usage": null
  },
  "vim": {
    "mode": "NORMAL"
  },
  "worktree": {
    "name": "my-feature",
    "path": "/Users/<user>/.cursor/worktrees/repo/my-feature"
  }
}
```

### Available fields

| Field | Description |
|-------|-------------|
| `session_id` | 一意 session identifier |
| `session_name` | custom session name。name 未設定時は absent |
| `transcript_path` | conversation transcript file の path |
| `render_width_chars` | 利用可能 terminal 列数（built-in padding を除く） |
| `cwd`, `workspace.current_dir` | current working directory（同じ値） |
| `workspace.project_dir` | transcript 保存 directory |
| `workspace.added_dirs` | 追加 directory（現状 empty array） |
| `model.id`, `model.display_name` | 現在 model identifier と display name |
| `model.param_summary` | formatted parameter summary（例: "(Thinking)", "High"）。空の場合 absent |
| `model.max_mode` | max mode 有効時 `true`。それ以外 absent |
| `version` | CLI version string |
| `output_style.name` | `"default"` または `"compact"` |
| `context_window.total_input_tokens` | 推定 input token（used_percentage から導出） |
| `context_window.total_output_tokens` | 累積 output token（未 track 時 null） |
| `context_window.context_window_size` | context window 最大 token 数 |
| `context_window.used_percentage` | 使用 context window 割合 |
| `context_window.remaining_percentage` | 残り context window 割合 |
| `context_window.current_usage` | 直近 API call の token count（初回 call 前 null） |
| `vim.mode` | vim mode 有効時 `"NORMAL"` または `"INSERT"` |
| `worktree.name` | worktree 内実行時の worktree name |
| `worktree.path` | worktree directory の absolute path |

### absent になりうる Field

- `session_name` — custom name 設定時のみ
- `model.param_summary` — model に non-default parameter がある場合のみ
- `model.max_mode` — max mode 有効時のみ
- `vim` — vim mode 有効時のみ
- `worktree` — worktree 内実行時のみ

### null になりうる Field

- `context_window.current_usage` — 初回 API call 前 null
- `context_window.used_percentage`, `context_window.remaining_percentage` — session 序盤 null の場合あり

## Stdout / rendering

- **複数行** 対応: stdout の各行が status area の別 row として render
- **ANSI color code** 対応（chalk、tput、`\033[32m` など）
- command が non-zero exit かつ empty stdout の場合、status line は更新されない（前の text を保持）
- command が timeout、または script 実行中に新 update が来た場合、in-flight process は kill
- status line は local 実行で API token を消費しない

## Examples

### Basic: model + context usage

```bash
#!/usr/bin/env bash
payload=$(cat)
model=$(echo "$payload" | jq -r '.model.display_name')
pct=$(echo "$payload" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)
printf "\033[90m%s  ctx %s%%\033[0m" "$model" "$pct"
```

### Context progress bar

```bash
#!/usr/bin/env bash
input=$(cat)
MODEL=$(echo "$input" | jq -r '.model.display_name')
PCT=$(echo "$input" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)

BAR_WIDTH=10
FILLED=$((PCT * BAR_WIDTH / 100))
EMPTY=$((BAR_WIDTH - FILLED))
BAR=""
[ "$FILLED" -gt 0 ] && printf -v FILL "%${FILLED}s" && BAR="${FILL// /▓}"
[ "$EMPTY" -gt 0 ] && printf -v PAD "%${EMPTY}s" && BAR="${BAR}${PAD// /░}"

echo "[$MODEL] $BAR $PCT%"
```

### Multi-line with git info

```bash
#!/usr/bin/env bash
input=$(cat)
MODEL=$(echo "$input" | jq -r '.model.display_name')
DIR=$(echo "$input" | jq -r '.workspace.current_dir')
PCT=$(echo "$input" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)

BRANCH=""
git rev-parse --git-dir > /dev/null 2>&1 && BRANCH=" | 🌿 $(git branch --show-current 2>/dev/null)"

echo -e "\033[36m[$MODEL]\033[0m 📁 ${DIR##*/}$BRANCH"
echo -e "ctx $PCT%"
```

### Inline jq command（script file 不要）

```json
{
  "statusLine": {
    "type": "command",
    "command": "jq -r '\"[\\(.model.display_name)] \\(.context_window.used_percentage // 0)% context\"'"
  }
}
```

## Testing

mock input で script をテスト:

```bash
echo '{"model":{"display_name":"Opus"},"context_window":{"used_percentage":25}}' | ./statusline.sh
```

command は `child_process.spawn` で spawn（Unix では shell なし、Windows では .cmd/.bat 互換のため `shell: true`）。update は設定 interval で debounce。script 実行中に新 update が来た場合、in-flight process は `AbortController` で kill され、新 invocation が即開始されます。
