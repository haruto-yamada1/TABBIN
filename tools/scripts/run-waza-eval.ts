#!/usr/bin/env bun
/**
 * tools/scripts/run-waza-eval.ts
 *
 * TABBIN の Waza PoC 用ラッパー。Waza CLI (外部 Go バイナリ) を subprocess で起動し、
 * 終了コードをそのまま伝播する。Waza は npm 依存に追加せず外部 CLI 扱い。
 *
 * 使い方:
 *   bun tools/scripts/run-waza-eval.ts check        # waza check .apm/skills/check
 *   bun tools/scripts/run-waza-eval.ts spec-verify  # waza spec verify ...
 *   bun tools/scripts/run-waza-eval.ts run          # waza run evals/skills/check/eval.yaml -v
 *   bun tools/scripts/run-waza-eval.ts adversarial  # waza adversarial --spec ...
 *
 * 環境変数:
 *   WAZA_BIN   waza バイナリのパス (既定: PATH 上の `waza`)
 *
 * 戻り値: waza の終了コードをそのまま返す (0=成功, 1=テスト失敗, 2=設定エラー)。
 */

import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

type WazaSubcommand = 'check' | 'spec-verify' | 'run' | 'adversarial'

const RESULTS_DIR = '.waza-results'

const isString = (value: unknown): value is string => typeof value === 'string'

// Issue #794: 既定は check Skill (後方互換)。第 2 引数で任意の Skill を指定可能。
const resolveSkill = (skillArg: string | undefined): string => {
  const skill = isString(skillArg) && skillArg.length > 0 ? skillArg : 'check'
  return skill
}

const buildPaths = (skill: string) => {
  const skillPath = `.apm/skills/${skill}`
  const evalPath = `evals/skills/${skill}/eval.yaml`
  const resultsFile = `${RESULTS_DIR}/${skill}-results.json`
  return { skillPath, evalPath, resultsFile }
}

const resolveBinary = (): string => {
  const fromEnv = process.env.WAZA_BIN
  return isString(fromEnv) && fromEnv.length > 0 ? fromEnv : 'waza'
}

const buildArgs = (
  subcommand: WazaSubcommand,
  skill: string,
): readonly string[] => {
  const { skillPath, evalPath, resultsFile } = buildPaths(skill)
  switch (subcommand) {
    case 'check': {
      return ['check', skillPath] as const
    }
    case 'spec-verify': {
      return ['spec', 'verify', skillPath, evalPath] as const
    }
    case 'run': {
      return ['run', evalPath, '-v', '-o', resultsFile] as const
    }
    case 'adversarial': {
      return [
        'adversarial',
        '--spec',
        evalPath,
        '--on-unsafe-outcome',
        'warn',
      ] as const
    }
    default: {
      const _exhaustive: never = subcommand
      throw new Error(`Unknown waza subcommand: ${String(_exhaustive)}`)
    }
  }
}

const printUsage = (): void => {
  const lines = [
    'Usage: bun tools/scripts/run-waza-eval.ts <subcommand> [skill]',
    'Subcommands (skill defaults to "check"):',
    '  check [skill]        waza check .apm/skills/<skill>',
    '  spec-verify [skill]   waza spec verify <skill> <eval>',
    '  run [skill]           waza run evals/skills/<skill>/eval.yaml -v',
    '  adversarial [skill]   waza adversarial --spec evals/skills/<skill>/eval.yaml',
  ]
  for (const line of lines) {
    console.error(line)
  }
}

const parseSubcommand = (
  arg: string | undefined,
): WazaSubcommand | undefined => {
  const candidates: readonly WazaSubcommand[] = [
    'check',
    'spec-verify',
    'run',
    'adversarial',
  ]
  return candidates.find((candidate) => candidate === arg)
}

const main = (): void => {
  const subcommand = parseSubcommand(process.argv[2])
  if (subcommand === undefined) {
    printUsage()
    process.exit(2)
  }

  const skill = resolveSkill(process.argv[3])
  const binary = resolveBinary()
  const args = buildArgs(subcommand, skill)

  // run の結果を保存するディレクトリを事前に作る (waza -o は親 dir を作らない)。
  if (subcommand === 'run') {
    mkdirSync(RESULTS_DIR, { recursive: true })
  }

  // spawn でコマンドと引数を分離 (shell injection 対策)。
  const child = spawn(binary, [...args], {
    stdio: 'inherit',
    env: process.env,
  })

  child.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      console.error(
        `waza: command not found (path=${binary}). install v0.38.3 or set WAZA_BIN.`,
      )
    } else {
      console.error(`waza: failed to spawn: ${error.message}`)
    }
    process.exit(2)
  })

  child.on('exit', (code, signal) => {
    if (signal !== null) {
      process.exit(130)
    }
    process.exit(code ?? 2)
  })
}

main()
