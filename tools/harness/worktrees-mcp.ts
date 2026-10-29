import { spawnSync } from 'node:child_process'
import path from 'node:path'

import { z } from 'zod'

const serverSchema = z.array(
  z
    .object({
      name: z.string(),
      enabled: z.boolean().default(true),
      transport: z
        .object({
          type: z.string(),
          command: z.string().optional(),
          args: z.array(z.string()).default([]),
        })
        .loose(),
    })
    .loose(),
)

export function worktreeMcpArguments(
  worktree: string,
  env: NodeJS.ProcessEnv,
): string[] {
  const result = spawnSync('codex', ['mcp', 'list', '--json'], {
    cwd: worktree,
    env,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(
      'Codex MCP inventory unavailable; inspect configuration locally',
    )
  }
  let servers: z.infer<typeof serverSchema>
  try {
    servers = serverSchema.parse(JSON.parse(result.stdout))
  } catch {
    throw new Error('Codex MCP inventory is invalid')
  }
  const overrides: string[] = []
  const add = (name: string, key: string, value: unknown) => {
    overrides.push(
      '-c',
      `mcp_servers.${JSON.stringify(name)}.${key}=${JSON.stringify(value)}`,
    )
  }
  for (const server of servers.filter((s) => s.enabled)) {
    if (!['serena', 'context-mode', 'context_mode'].includes(server.name)) {
      continue
    }
    if (server.transport.type !== 'stdio') {
      throw new Error(
        'Shared remote project MCP cannot be isolated; use a task-local stdio server',
      )
    }
    add(server.name, 'cwd', worktree)
    add(server.name, 'env.CLAUDE_PROJECT_DIR', worktree)
    if (server.name === 'serena') {
      const args = serenaArguments(server.transport.args, worktree)
      add(server.name, 'args', args)
      continue
    }
    const command = path.basename(server.transport.command ?? '')
    if (
      !['node', 'bun'].includes(command) ||
      !server.transport.args.some(
        (arg) =>
          path.isAbsolute(arg) &&
          arg.includes('context-mode') &&
          arg.endsWith('/build/server.js'),
      )
    ) {
      throw new Error(
        'context-mode launcher may repair shared hooks; use the installed direct build/server.js entry',
      )
    }
    for (const key of [
      'CONTEXT_MODE_PROJECT_DIR',
      'CONTEXT_MODE_DATA_DIR',
      'CLAUDE_CONFIG_DIR',
      'TMPDIR',
    ]) {
      const value = env[key]
      if (!value) {
        throw new Error('MCP runtime environment is missing')
      }
      add(server.name, `env.${key}`, value)
    }
    add(server.name, 'env.CONTEXT_MODE_PLATFORM', 'codex')
  }
  return overrides
}

function serenaArguments(original: string[], worktree: string): string[] {
  const args = [...original]
  if (!args.includes('start-mcp-server')) {
    throw new Error(
      'Serena launcher cannot be isolated; inspect its installed arguments',
    )
  }
  const projectIndex = args.indexOf('--project')
  const attachedIndex = args.findIndex((arg) => arg.startsWith('--project='))
  if (projectIndex >= 0) {
    args.splice(projectIndex, 2, '--project', worktree)
  } else if (attachedIndex >= 0) {
    args[attachedIndex] = `--project=${worktree}`
  } else if (!args.includes('--project-from-cwd')) {
    args.push('--project', worktree)
  }
  return args
}
