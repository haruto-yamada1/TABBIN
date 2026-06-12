---
name: create-hook
description: Cursor hook を作成します。hook 作成、hooks.json 記述、hook script 追加、agent event 周辺の behavior 自動化時に使います。
---
# Cursor hook の作成

agent event の前後に custom logic を実行したい場合に hook を作成します。hook は stdin/stdout で JSON をやり取りする script または prompt-based check で、behavior を observe、block、modify、follow up できます。

ユーザーが hook を依頼した場合、format の説明で止まらず、不足要件を収集し、hook file を直接 create または update します。

## 要件の収集

書き始める前に次を決めます:

1. **Scope**: project hook か user hook か
2. **Trigger**: どの event で hook を実行するか
3. **Behavior**: audit、deny/allow、input rewrite、context inject、workflow 継続のどれか
4. **Implementation**: command hook（script）か prompt hook か
5. **Filtering**: 特定 tool、command、subagent type のみに限定する matcher が必要か
6. **Safety**: failure 時は fail open か fail closed か

会話から推測できる場合は推測し、不足分だけ尋ねます。

## 正しい Location の選択

- **Project hooks**: `.cursor/hooks.json` と `.cursor/hooks/*`
- **User hooks**: `~/.cursor/hooks.json` と `~/.cursor/hooks/*`

path の扱い:

- **Project hooks** は project root から実行 — `.cursor/hooks/my-hook.sh` のような path
- **User hooks** は `~/.cursor/` から実行 — `./hooks/my-hook.sh` または `hooks/my-hook.sh`

repository と共有し version control する behavior には **project hooks** を優先します。

## Hook Event の選択

ユーザーの goal に最も narrow な event を選びます。

### よく使う Agent event

- `sessionStart`, `sessionEnd`: session の setup または audit
- `preToolUse`, `postToolUse`, `postToolUseFailure`: すべての tool 横断
- `subagentStart`, `subagentStop`: Task/subagent workflow の制御または継続
- `beforeShellExecution`, `afterShellExecution`: terminal command の gate または audit
- `beforeMCPExecution`, `afterMCPExecution`: MCP tool call の gate または audit
- `beforeReadFile`, `afterFileEdit`: file read 制御または edit 後処理
- `beforeSubmitPrompt`: prompt 送信前の validate
- `preCompact`: context compaction の observe
- `stop`: agent 完了の handle
- `afterAgentResponse`, `afterAgentThought`: agent output または reasoning の track

### Tab event

- `beforeTabFileRead`: inline completion 用 file access 制御
- `afterTabFileEdit`: Tab による edit の後処理

### Event 選択クイックガイド

- **shell command を block または approve** → `beforeShellExecution`
- **shell output を audit** → `afterShellExecution`
- **edit 後に file を format** → `afterFileEdit`
- **特定 tool call を block または rewrite** → `preToolUse`
- **tool 成功後に follow-up context を追加** → `postToolUse`
- **subagent 実行可否を制御** → `subagentStart`
- **subagent loop を chain** → `subagentStop`
- **prompt の secret や policy 違反を check** → `beforeSubmitPrompt`
- **MCP call を protect** → `beforeMCPExecution`

## Hooks File Format

schema version 1 の `hooks.json` を作成:

```json
{
  "version": 1,
  "hooks": {
    "afterFileEdit": [
      {
        "command": ".cursor/hooks/format.sh"
      }
    ]
  }
}
```

各 hook definition に含められる項目:

- `command`: shell command または script path
- `type`: `"command"` または `"prompt"`（default: `"command"`）
- `timeout`: timeout（秒）
- `matcher`: hook 実行条件の filter
- `failClosed`: hook crash、timeout、invalid JSON 時に action を block
- `loop_limit`: 主に `stop` と `subagentStop` の follow-up loop 用

## Matchers

すべての event で hook を走らせないよう matcher を使います。

- `preToolUse` / `postToolUse` / `postToolUseFailure`: `Shell`、`Read`、`Write`、`Task`、または `MCP: ...` 形式の MCP tool など tool type で match
- `subagentStart` / `subagentStop`: `generalPurpose`、`explore`、`shell` など subagent type で match
- `beforeShellExecution` / `afterShellExecution`: 完全な shell command string で match
- `beforeReadFile`: `Read` または `TabRead` など tool type で match
- `afterFileEdit`: `Write` または `TabWrite` など tool type で match
- `beforeSubmitPrompt`: 値 `UserPromptSubmit` に match

matcher に関する重要な警告:

- matcher は POSIX/grep ではなく JavaScript-style regular expression
- `[[:space:]]` など POSIX class は使わない。`\s` など JavaScript 相当を使う
- matcher が tricky な場合、まず matcher なしまたは非常に単純な matcher で動作確認し、load と fire を確認してから絞る

1 つの risky command family だけに限定したい場合、最初の動作版は script 側 filter を優先し、matcher は単純で明確に正しい場合のみ後から追加します。

## Command Hooks

command hook が default。stdin で JSON を受け取り、stdout で JSON を返せます。

command hook を使う前に、依存する executable が hook environment で実際に動くか確認:

- script 自体に valid shebang があり executable
- 呼び出す helper binary が install 済みで `$PATH` 上にある
- `jq`、`python3`、`node`、repo-local CLI など script が依存する tool を明示的に verify

自分の machine に common だから存在すると仮定しない。

### 最小 project-level 例

```json
{
  "version": 1,
  "hooks": {
    "beforeShellExecution": [
      {
        "command": ".cursor/hooks/approve-network.sh",
        "matcher": "curl|wget|nc ",
        "failClosed": true
      }
    ]
  }
}
```

```bash
#!/bin/bash
input=$(cat)
command=$(echo "$input" | jq -r '.command // empty')

if [[ "$command" =~ curl|wget|nc ]]; then
  echo '{
    "permission": "ask",
    "user_message": "This command may make a network request. Please review it before continuing.",
    "agent_message": "A hook flagged this shell command as a possible network call."
  }'
  exit 0
fi

echo '{ "permission": "allow" }'
exit 0
```

重要な behavior:

- Exit code `0`: success
- Exit code `2`: action を block（deny を返すのと同じ）
- その他 non-zero exit code: `failClosed: true` でない限り fail open

hook script 作成後は必ず executable にします。

## Prompt Hooks

policy を script より説明しやすい場合に prompt hook が有用です。

```json
{
  "version": 1,
  "hooks": {
    "beforeShellExecution": [
      {
        "type": "prompt",
        "prompt": "Does this command look safe to execute? Only allow read-only operations. Here is the hook input: $ARGUMENTS",
        "timeout": 10
      }
    ]
  }
}
```

軽量 policy 判断には prompt hook。logic が deterministic である必要がある、または exact で auditable な behavior が必要な場合は command hook を優先します。

## Event Output Cheat Sheet

その event がサポートする output field のみ返します。

- `preToolUse`: `permission`、`user_message`、`agent_message`、`updated_input` を返せる
- `postToolUse`: `additional_context` を返せる。MCP tool では `updated_mcp_tool_output` も
- `subagentStart`: `permission` と `user_message` を返せる
- `subagentStop`: `followup_message` を返せる
- `beforeShellExecution` / `beforeMCPExecution`: `permission`、`user_message`、`agent_message` を返せる

tool call を rewrite したい場合は `preToolUse` を優先。shell command の gate のみなら `beforeShellExecution` を優先。

## 実装ワークフロー

1. 正しい location と event を選ぶ
2. 正しい `hooks.json` を create または update
3. matcher なし、または最も単純で安全な matcher から始める
4. 対応する hooks directory に script を作成
5. stdin JSON を読み、必要な behavior を実装
6. script を executable にする
7. script が使う helper executable が install 済みで `$PATH` 上にあることを verify
8. 関連 action を trigger して hook をテスト
9. Cursor の **Hooks** settings tab または **Hooks** output channel で behavior を確認

既存 hooks setup を編集する場合、無関係な hook は保持し、必要最小限の entry だけ変更します。

## Validation と Troubleshooting

- Cursor は `hooks.json` を watch し save 時に reload
- hook が load されない場合は Cursor を restart
- relative path を再確認:
  - project hooks → project root 相対
  - user hooks → `~/.cursor/` 相対
- hook が全く load されない場合、matcher/config parsing を疑う。matcher を外して base hook が動くことを確認してから絞る
- script が external command を実行する場合、各 command が hook process から `command -v` 等で reachable か verify
- failure 時に block すべきなら `failClosed: true`
- command hook が意図的に block する場合、exit code `2` は valid

## Final Checklist

- [ ] 正しい hook location と path style を使った
- [ ] 最も narrow な正しい event を選んだ
- [ ] 適切な場合 matcher を追加した
- [ ] その hook event がサポートする field のみ返した
- [ ] script を executable にした
- [ ] 実際の event を trigger して hook をテストした
- [ ] debug が必要なら Hooks tab または Hooks output channel を確認した
