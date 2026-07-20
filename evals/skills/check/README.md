# check Skill 評価 suite (Waza PoC)

`.apm/skills/check/SKILL.md` を [Waza](https://github.com/microsoft/waza) で評価する
最小 PoC です。既存 Harness / APM / quality check / CI には影響しません。

## 前提

- Waza CLI `v0.38.3` をローカルに固定インストール済みであること。
- TABBIN の `package.json` には Waza を追加しません (外部 CLI 扱い)。

## Waza のインストール (ローカル・手動)

`curl|bash` は使わず、固定 Release asset と checksum を検証して入れます。

```bash
WAZA_VERSION=v0.38.3
# OS/Arch に合わせて asset を選ぶ (例: darwin-arm64)
ASSET=waza-darwin-arm64
# 期待する sha256 (v0.38.3 checksums.txt より)
EXPECT_SHA=99aa4366b198f319145cffeef42d500eb9f6178235a0537d34c19dd8f2f46fec

tmp="$(mktemp -d)"
curl -fSL -o "$tmp/$ASSET" \
  "https://github.com/microsoft/waza/releases/download/${WAZA_VERSION}/${ASSET}"
# checksum 検証
echo "$EXPECT_SHA  $tmp/$ASSET" | shasum -a 256 -c -
# 配置 (PATH の通った場所へ)
install -m 0755 "$tmp/$ASSET" "$HOME/bin/waza"
waza --version
```

v0.38.3 の checksum 一覧 (全 OS):

| asset                  | sha256                                                             |
| ---------------------- | ------------------------------------------------------------------ |
| waza-darwin-amd64      | `f2a0c6952abbb5ad75bf17e2769c34c480093c269574839368b82d40b3c5dec9` |
| waza-darwin-arm64      | `99aa4366b198f319145cffeef42d500eb9f6178235a0537d34c19dd8f2f46fec` |
| waza-linux-amd64       | `168e3562deeaa1958d44366b37d963b48b091c325c6c9b5b2613e5399ff077b9` |
| waza-linux-arm64       | `ab5d6a3e502a0f7f5a48149e034fa07875a2fe02addddec6b9b9dba14f3b4685` |
| waza-windows-amd64.exe | `b2f7c84dfd8df44a6eb962385b37976c59637c96f0a9b34cf7328e8ababc5b88` |
| waza-windows-arm64.exe | `b867521c70ae817fed827d0de6bde4ce927cd7df9be5214d7033ae82ed14c891` |

## 実行

リポジトリ root で:

```bash
# (1) Skill readiness の deterministic check
waza check .apm/skills/check

# (2) eval が SKILL.md の要件を cover しているか (deterministic)
waza spec verify .apm/skills/check evals/skills/check/eval.yaml

# (3) eval 実行 (mock executor / API key 不要)
waza run evals/skills/check/eval.yaml -v

# (4) adversarial pack (prompt injection) の実行
waza adversarial --spec evals/skills/check/eval.yaml --on-unsafe-outcome fail

# (5) 結果を保存
waza run evals/skills/check/eval.yaml -o .codex/waza-results/check-results.json
```

または Bun ラッパー経由:

```bash
bun run waza:check        # waza check .apm/skills/check
bun run waza:spec:verify  # waza spec verify ...
bun run waza:eval:check   # waza run evals/skills/check/eval.yaml -v
bun run waza:adversarial  # waza adversarial --spec ...
```

## 構成

```
evals/skills/check/
├── eval.yaml              # 評価 spec (mock executor, schemaVersion 1.2)
├── trigger_tests.yaml     # should_trigger / should_not_trigger 例
├── tasks/                 # 8 task (positive/negative/guardrail/adversarial)
└── fixtures/repo/         # 隔離された疑似 repo (実 repo 非破壊)
    ├── package.json        # `quality` script 欠如を再現
    ├── src/lib/example.ts
    └── quality-broken.txt  # prompt injection 命令を仕込み済み
```

## 制約

- `executor: mock` は API key 不要だが、agent の「実際の挙動」は再現しない。
  guardrail / adversarial の実挙動検証には `executor: copilot-sdk` が必要
  (GitHub Token / Copilot quota)。本 PoC では未実施。
- Ollama / GLM は Waza の標準 executor で未対応。custom provider 経由の Copilot SDK
  拡張のみ。
- 設計の詳細は `docs/plans/2026-07-19-waza-skill-eval-poc-design.md`。
