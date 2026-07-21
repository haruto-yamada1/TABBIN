import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

// Issue #794 Layer 1: 外部モデル/API を使わず PR で実行する静的・deterministic
// 検査。eval suite / task file が Waza の task schema に適合し、Skill 参照・
// package script 参照・trigger coverage・adversarial 最低件数・fixture 安全性が
// 壊れていないことを保証する。waza バイナリ不要 (vitest で完結)。

const projectRoot = path.resolve(import.meta.dirname, '..', '..')
const evalsRoot = path.join(projectRoot, 'evals', 'skills')
const skillsRoot = path.join(projectRoot, '.apm', 'skills')

const skillDirs = readdirSync(skillsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

const evalSuites = readdirSync(evalsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

const readYaml = (relativePath: string): unknown =>
  parse(readFileSync(path.join(projectRoot, relativePath), 'utf8'))

const packageScripts = Object.keys(
  (JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
    .scripts ?? {}) as Record<string, unknown>,
)

// mock executor で意味を持つ grader type (waza v0.38.3 で確認済み)。
const ALLOWED_GRADER_TYPES = new Set([
  'text',
  'tool_constraint',
  'trigger',
  'behavior',
  'action_sequence',
  'skill_invocation',
])

const FORBIDDEN_FIXTURE_TOKENS = [
  // 実 repo / 実 secret へのアクセスを示す token。fixture は隔離されていなければならない。
  'process.env.GITHUB_TOKEN',
  'process.env.OPENAI_API_KEY',
  '~/.ssh',
  '/Users/',
  '/home/',
]

describe('waza eval contract (Layer 1) — eval.yaml schema', () => {
  for (const skill of evalSuites) {
    describe(`evals/skills/${skill}`, () => {
      const evalPath = `evals/skills/${skill}/eval.yaml`
      const evalDoc = readYaml(evalPath) as {
        name?: unknown
        skill?: unknown
        schemaVersion?: unknown
        version?: unknown
        config?: Record<string, unknown>
        tasks?: unknown
        adversarial?: Record<string, unknown>
      }

      it('has the required top-level fields', () => {
        expect(evalDoc.name, 'name').toBeTypeOf('string')
        expect(evalDoc.skill, 'skill').toBeTypeOf('string')
        expect(evalDoc.schemaVersion, 'schemaVersion').toBeTypeOf('string')
        expect(evalDoc.version, 'version').toBeTypeOf('string')
      })

      it('skill field matches the directory and resolves to an existing skill', () => {
        expect(evalDoc.skill).toBe(skill)
        expect(skillDirs, `${skill} not in .apm/skills`).toContain(skill)
        expect(existsSync(path.join(skillsRoot, skill, 'SKILL.md'))).toBe(true)
      })

      it('uses the mock executor for the PoC layer (no API key required)', () => {
        expect(evalDoc.config?.executor).toBe('mock')
      })

      it('injects the skill body for trigger / guardrail judgment', () => {
        expect(evalDoc.config?.inject_skill_body).toBe(true)
      })

      it('declares a non-empty tasks glob', () => {
        // Waza は `tasks: ['tasks/*.yaml']` のように glob の配列を受け取る。
        expect(Array.isArray(evalDoc.tasks)).toBe(true)
        expect((evalDoc.tasks as unknown[]).length).toBeGreaterThan(0)
        for (const entry of evalDoc.tasks as unknown[]) {
          expect(entry).toBeTypeOf('string')
        }
      })

      it('pins the prompt-injection adversarial pack with fail on unsafe outcome', () => {
        expect(evalDoc.adversarial?.packs).toEqual(['prompt-injection'])
        expect(evalDoc.adversarial?.on_unsafe_outcome).toBe('fail')
      })
    })
  }
})

describe('waza eval contract (Layer 1) — task files', () => {
  for (const skill of evalSuites) {
    describe(`evals/skills/${skill}/tasks`, () => {
      const tasksDir = path.join(evalsRoot, skill, 'tasks')
      const taskFiles = readdirSync(tasksDir).filter((f) => f.endsWith('.yaml'))

      it('has at least one task file', () => {
        expect(taskFiles.length).toBeGreaterThan(0)
      })

      for (const file of taskFiles) {
        const relativePath = `evals/skills/${skill}/tasks/${file}`
        const doc = readYaml(relativePath) as {
          id?: unknown
          name?: unknown
          inputs?: { prompt?: unknown }
          expected?: Record<string, unknown>
          graders?: { type?: string; name?: string; config?: unknown }[]
          context_dir?: string
        }

        describe(`task: ${relativePath}`, () => {
          it('has an id and a name (canonical Waza task schema)', () => {
            // 旧形式 (type/prompt/expect) は waza に無視されて trivial pass になる
            // ため、正規 schema の id/name に整形式でなければならない。
            expect(doc.id, 'id').toBeTypeOf('string')
            expect(doc.name, 'name').toBeTypeOf('string')
          })

          it('provides inputs.prompt (not a top-level prompt field)', () => {
            expect(doc.inputs?.prompt, 'inputs.prompt').toBeTypeOf('string')
            expect(doc, 'top-level prompt must not be used').not.toHaveProperty(
              'prompt',
            )
            // 旧 expect 形式も禁止 (waza に無視される)。
            expect(doc, 'top-level expect must not be used').not.toHaveProperty(
              'expect',
            )
          })

          it('declares graders as a non-empty array of allowed types', () => {
            expect(Array.isArray(doc.graders)).toBe(true)
            expect(doc.graders?.length).toBeGreaterThan(0)
            for (const grader of doc.graders ?? []) {
              expect(
                ALLOWED_GRADER_TYPES.has(String(grader.type)),
                `unknown grader type ${String(grader.type)}`,
              ).toBe(true)
              expect(grader.name, 'grader.name').toBeTypeOf('string')
            }
          })

          it('does not reference real repo paths or real secrets in task file', () => {
            const raw = readFileSync(
              path.join(projectRoot, relativePath),
              'utf8',
            )
            for (const token of FORBIDDEN_FIXTURE_TOKENS) {
              expect(raw, `forbidden token ${token}`).not.toContain(token)
            }
          })
        })
      }
    })
  }
})

describe('waza eval contract (Layer 1) — trigger coverage', () => {
  it('the check skill has trigger_tests.yaml with positive and negative prompts', () => {
    const triggerPath = 'evals/skills/check/trigger_tests.yaml'
    expect(existsSync(path.join(projectRoot, triggerPath))).toBe(true)
    const doc = readYaml(triggerPath) as {
      should_trigger_prompts?: unknown[]
      should_not_trigger_prompts?: unknown[]
    }
    expect(doc.should_trigger_prompts?.length).toBeGreaterThan(0)
    expect(doc.should_not_trigger_prompts?.length).toBeGreaterThan(0)
  })
})

describe('waza eval contract (Layer 1) — adversarial coverage', () => {
  // 副作用 Skill は prompt-injection / secret-exfil / untrusted-content の
  // 最低 3 件を要求する。check は trigger/guardrail 中心のため最低 1 件とする。
  const SIDE_EFFECT_SKILLS = new Set([
    'commit-push-pr',
    'github-issue-implementation',
    'github-pr-review',
    'harness-orchestrate',
  ])
  for (const skill of evalSuites) {
    const minimum = SIDE_EFFECT_SKILLS.has(skill) ? 3 : 1
    it(`evals/skills/${skill} has at least ${minimum} adversarial tasks`, () => {
      const tasksDir = path.join(evalsRoot, skill, 'tasks')
      const taskDocs = readdirSync(tasksDir)
        .filter((f) => f.endsWith('.yaml'))
        .map(
          (f) =>
            readYaml(`evals/skills/${skill}/tasks/${f}`) as {
              name?: string
              tags?: string[]
            },
        )
      const adversarial = taskDocs.filter(
        (d) =>
          (d.tags?.includes('adversarial') ?? false) ||
          /injection|exfil|untrusted|override/i.test(d.name ?? ''),
      )
      expect(
        adversarial.length,
        `${skill} needs >=${minimum} adversarial tasks`,
      ).toBeGreaterThanOrEqual(minimum)
    })
  }
})

describe('waza eval contract (Layer 1) — referenced package scripts exist', () => {
  it('package.json declares the four waza wrapper scripts backed by run-waza-eval.ts', () => {
    const pkg = JSON.parse(
      readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> }
    const expected: Record<string, string> = {
      'waza:check': 'check',
      'waza:spec:verify': 'spec-verify',
      'waza:eval:check': 'run',
      'waza:adversarial': 'adversarial',
    }
    for (const [script, subcommand] of Object.entries(expected)) {
      expect(pkg.scripts[script], `missing ${script}`).toBeDefined()
      expect(
        pkg.scripts[script],
        `${script} must invoke run-waza-eval.ts ${subcommand}`,
      ).toContain(`run-waza-eval.ts ${subcommand}`)
    }
  })

  it('package.json declares the four waza wrapper scripts', () => {
    for (const script of [
      'waza:check',
      'waza:spec:verify',
      'waza:eval:check',
      'waza:adversarial',
    ]) {
      expect(packageScripts, `missing ${script}`).toContain(script)
    }
  })
})

describe('waza eval contract (Layer 1) — result artifact format', () => {
  it('run-waza-eval.ts writes results under .waza-results/ and creates the directory', () => {
    const runScript = readFileSync(
      path.join(projectRoot, 'tools/scripts/run-waza-eval.ts'),
      'utf8',
    )
    // 結果 artifact の出力先が .waza-results/ に固定されている。
    expect(runScript).toContain('.waza-results')
    expect(runScript).toContain('mkdirSync(RESULTS_DIR')
  })
})
