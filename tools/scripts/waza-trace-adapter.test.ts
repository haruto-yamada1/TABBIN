import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { adaptWazaToTraces } from './waza-trace-adapter'

// Issue #799 Step 4 — Waza session/transcript → EvalTrace adapter.
// 実モデル transcript から tool invocation / outbound payload / filesystem diff を
// 抽出し、trace evaluator が消費する EvalTrace へ変換する。
// mock (transcript: null) は final_output のみ抽出する。
// malformed artifact は fail-closed で例外を投げる。

const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'waza-adapter-test-'))

const writeResults = (name: string, data: unknown): string => {
  const p = path.join(tmpRoot, name)
  writeFileSync(p, JSON.stringify(data))
  return p
}

const writeTranscript = (
  dirName: string,
  fileName: string,
  data: unknown,
): string => {
  const dir = path.join(tmpRoot, dirName)
  mkdirSync(dir, { recursive: true })
  const p = path.join(dir, fileName)
  writeFileSync(p, JSON.stringify(data))
  return dir
}

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

describe('waza-trace-adapter — mock transcript (null)', () => {
  it('extracts final_output from results when transcript is null', () => {
    const resultsPath = writeResults('mock-results.json', {
      schemaVersion: '1.0',
      skill: 'check',
      tasks: [
        {
          test_id: 'task-1',
          display_name: 'Task 1',
          status: 'passed',
          runs: [
            {
              status: 'passed',
              final_output: 'Mock response for: do something',
              transcript: null,
            },
          ],
        },
      ],
    })
    const result = adaptWazaToTraces({
      resultsPath,
      requestIntent: 'read-only',
    })
    expect(result.taskCount).toBe(1)
    expect(result.traces).toHaveLength(1)
    expect(result.traces[0].final_output).toBe(
      'Mock response for: do something',
    )
    expect(result.traces[0].tool_invocations).toEqual([])
    expect(result.traces[0].request_intent).toBe('read-only')
  })

  it('falls back to run.output when final_output is absent', () => {
    const resultsPath = writeResults('mock-output.json', {
      tasks: [
        {
          test_id: 'task-2',
          runs: [{ status: 'passed', output: 'fallback output' }],
        },
      ],
    })
    const result = adaptWazaToTraces({
      resultsPath,
      requestIntent: 'read-only',
    })
    expect(result.traces[0].final_output).toBe('fallback output')
  })
})

describe('waza-trace-adapter — real transcript with tool calls', () => {
  const realTranscript = [
    { role: 'user', content: 'Review this PR' },
    {
      role: 'assistant',
      content: 'Let me check the files',
      tool_calls: [
        { id: 'call-1', name: 'read_file', arguments: { path: 'src/a.ts' } },
        {
          id: 'call-2',
          name: 'bash',
          arguments: { command: 'bun run test:node' },
        },
      ],
    },
    {
      role: 'tool',
      tool_call_id: 'call-1',
      name: 'read_file',
      content: 'file content here',
    },
    {
      role: 'tool',
      tool_call_id: 'call-2',
      name: 'bash',
      content: 'all tests passed',
    },
    {
      role: 'assistant',
      content: 'The review is complete. No changes needed.',
    },
  ]

  it('extracts tool invocations from transcript array', () => {
    const resultsPath = writeResults('real-results.json', {
      tasks: [
        {
          test_id: 'real-task',
          display_name: 'Real Task',
          status: 'passed',
          runs: [
            {
              status: 'passed',
              final_output: 'The review is complete. No changes needed.',
              transcript: realTranscript,
            },
          ],
        },
      ],
    })
    const result = adaptWazaToTraces({
      resultsPath,
      requestIntent: 'read-only',
    })
    expect(result.traces[0].tool_invocations).toHaveLength(2)
    expect(result.traces[0].tool_invocations[0].name).toBe('read_file')
    expect(result.traces[0].tool_invocations[0].args).toEqual({
      path: 'src/a.ts',
    })
    expect(result.traces[0].tool_invocations[0].result).toBe(
      'file content here',
    )
    expect(result.traces[0].tool_invocations[1].name).toBe('bash')
    expect(result.traces[0].tool_invocations[1].result).toBe('all tests passed')
  })

  it('extracts tool calls from transcript file when provided', () => {
    const resultsPath = writeResults('real-file-results.json', {
      tasks: [
        {
          test_id: 'real-file-task',
          display_name: 'Real File Task',
          status: 'passed',
          runs: [{ status: 'passed' }],
        },
      ],
    })
    const transcriptDir = writeTranscript(
      'transcripts-file',
      'real-file-task-20260721.json',
      {
        task_id: 'real-file-task',
        task_name: 'Real File Task',
        status: 'passed',
        final_output: 'Done',
        transcript: realTranscript,
      },
    )
    const result = adaptWazaToTraces({
      resultsPath,
      transcriptDir,
      requestIntent: 'read-only',
    })
    expect(result.traces[0].tool_invocations).toHaveLength(2)
    expect(result.traces[0].final_output).toBe('Done')
  })

  it('maps results to correct invocations for parallel same-name tool calls (Issue #799 review)', () => {
    // Two bash calls in the same assistant turn with different tool_call_ids
    // and different commands/results. Results must not be swapped.
    const parallelTranscript = [
      { role: 'user', content: 'Run two checks' },
      {
        role: 'assistant',
        content: 'Running both',
        tool_calls: [
          {
            id: 'call-a',
            name: 'bash',
            arguments: { command: 'bun run test:node' },
          },
          {
            id: 'call-b',
            name: 'bash',
            arguments: { command: 'bun run test:dom' },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'call-a',
        name: 'bash',
        content: 'node tests passed',
      },
      {
        role: 'tool',
        tool_call_id: 'call-b',
        name: 'bash',
        content: 'dom tests passed',
      },
    ]
    const resultsPath = writeResults('parallel-results.json', {
      tasks: [
        {
          test_id: 'parallel-task',
          runs: [
            {
              status: 'passed',
              final_output: 'done',
              transcript: parallelTranscript,
            },
          ],
        },
      ],
    })
    const result = adaptWazaToTraces({
      resultsPath,
      requestIntent: 'read-only',
    })
    const invs = result.traces[0].tool_invocations
    expect(invs).toHaveLength(2)
    // call-a result must be 'node tests passed', not 'dom tests passed'
    expect(invs[0].name).toBe('bash')
    expect(invs[0].args).toEqual({ command: 'bun run test:node' })
    expect(invs[0].result).toBe('node tests passed')
    // call-b result must be 'dom tests passed', not 'node tests passed'
    expect(invs[1].name).toBe('bash')
    expect(invs[1].args).toEqual({ command: 'bun run test:dom' })
    expect(invs[1].result).toBe('dom tests passed')
  })
})

describe('waza-trace-adapter — outbound payloads and filesystem diffs', () => {
  it('extracts outbound payloads from transcript', () => {
    const transcript = [
      { role: 'assistant', content: 'I will reply', tool_calls: [] },
      {
        role: 'assistant',
        content: '',
        outbound: { kind: 'comment', content: 'Looks good to me' },
      },
    ]
    const resultsPath = writeResults('outbound-results.json', {
      tasks: [
        {
          test_id: 'outbound-task',
          runs: [{ status: 'passed', final_output: 'replied', transcript }],
        },
      ],
    })
    const result = adaptWazaToTraces({
      resultsPath,
      requestIntent: 'read-only',
    })
    expect(result.traces[0].outbound_payloads).toHaveLength(1)
    expect(result.traces[0].outbound_payloads?.[0].kind).toBe('comment')
    expect(result.traces[0].outbound_payloads?.[0].content).toBe(
      'Looks good to me',
    )
  })

  it('extracts filesystem diffs from transcript', () => {
    const transcript = [
      {
        role: 'assistant',
        content: 'I will edit',
        tool_calls: [
          { id: 'c1', name: 'edit_file', arguments: { path: 'src/a.ts' } },
        ],
        filesystem_diffs: [{ path: 'src/a.ts', status: 'modified' }],
      },
    ]
    const resultsPath = writeResults('fsdiff-results.json', {
      tasks: [
        {
          test_id: 'fsdiff-task',
          runs: [{ status: 'passed', final_output: 'edited', transcript }],
        },
      ],
    })
    const result = adaptWazaToTraces({
      resultsPath,
      requestIntent: 'side-effect',
    })
    expect(result.traces[0].filesystem_diffs).toHaveLength(1)
    expect(result.traces[0].filesystem_diffs?.[0].path).toBe('src/a.ts')
    expect(result.traces[0].filesystem_diffs?.[0].status).toBe('modified')
  })
})

describe('waza-trace-adapter — fail-closed on malformed input', () => {
  it('throws when results file does not exist', () => {
    expect(() =>
      adaptWazaToTraces({
        resultsPath: path.join(tmpRoot, 'nonexistent.json'),
        requestIntent: 'read-only',
      }),
    ).toThrow(/not found/)
  })

  it('throws when results JSON has no tasks', () => {
    const resultsPath = writeResults('empty-results.json', { tasks: [] })
    expect(() =>
      adaptWazaToTraces({
        resultsPath,
        requestIntent: 'read-only',
      }),
    ).toThrow(/no tasks/)
  })

  it('throws when task has no runs', () => {
    const resultsPath = writeResults('no-runs.json', {
      tasks: [{ test_id: 'x', display_name: 'X' }],
    })
    expect(() =>
      adaptWazaToTraces({
        resultsPath,
        requestIntent: 'read-only',
      }),
    ).toThrow(/no runs/)
  })

  it('throws when transcript is not an array (unexpected type)', () => {
    const resultsPath = writeResults('bad-transcript.json', {
      tasks: [
        {
          test_id: 'bad',
          runs: [
            { status: 'passed', final_output: 'x', transcript: 'not-an-array' },
          ],
        },
      ],
    })
    expect(() =>
      adaptWazaToTraces({
        resultsPath,
        requestIntent: 'read-only',
      }),
    ).toThrow(/not an array/)
  })

  it('throws when transcript turn is not an object', () => {
    const resultsPath = writeResults('bad-turn.json', {
      tasks: [
        {
          test_id: 'bad-turn',
          runs: [
            {
              status: 'passed',
              final_output: 'x',
              transcript: ['not-an-object'],
            },
          ],
        },
      ],
    })
    expect(() =>
      adaptWazaToTraces({
        resultsPath,
        requestIntent: 'read-only',
      }),
    ).toThrow(/not an object/)
  })

  it('throws when filesystem_diff entry is not an object', () => {
    const resultsPath = writeResults('bad-fsdiff.json', {
      tasks: [
        {
          test_id: 'bad-fsdiff',
          runs: [
            {
              status: 'passed',
              final_output: 'x',
              transcript: [
                { role: 'assistant', filesystem_diffs: ['not-an-object'] },
              ],
            },
          ],
        },
      ],
    })
    expect(() =>
      adaptWazaToTraces({
        resultsPath,
        requestIntent: 'side-effect',
      }),
    ).toThrow(/filesystem_diff.*not an object/)
  })

  it('throws on invalid JSON in results file', () => {
    const p = path.join(tmpRoot, 'invalid.json')
    writeFileSync(p, '{ invalid json')
    expect(() =>
      adaptWazaToTraces({
        resultsPath: p,
        requestIntent: 'read-only',
      }),
    ).toThrow(/failed to parse/)
  })
})

describe('waza-trace-adapter — multiple tasks', () => {
  it('produces one trace per task', () => {
    const resultsPath = writeResults('multi-results.json', {
      tasks: [
        { test_id: 't1', runs: [{ status: 'passed', final_output: 'out1' }] },
        { test_id: 't2', runs: [{ status: 'passed', final_output: 'out2' }] },
        { test_id: 't3', runs: [{ status: 'failed', final_output: 'out3' }] },
      ],
    })
    const result = adaptWazaToTraces({
      resultsPath,
      requestIntent: 'read-only',
    })
    expect(result.taskCount).toBe(3)
    expect(result.traces).toHaveLength(3)
    expect(result.traces[0].final_output).toBe('out1')
    expect(result.traces[1].final_output).toBe('out2')
    expect(result.traces[2].final_output).toBe('out3')
  })
})
