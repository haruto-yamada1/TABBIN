import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const bin = path.join(root, '.cache/ci-audit/bin')
const [mode, ...requested] = process.argv.slice(2)
if (!mode || !['lint', 'security', 'security-report'].includes(mode)) {
  throw new Error(
    'Usage: node tools/ci-audit/run.mjs lint|security|security-report [workflow.yml ...]',
  )
}
/** @param {string} directory @returns {string[]} */
const collect = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      return collect(file)
    }
    return /\.ya?ml$/.test(entry.name) ? [file] : []
  })
const files = requested.length
  ? requested.map((file) => path.resolve(file))
  : collect(path.join(root, '.github/workflows')).toSorted()
if (
  !files.length ||
  files.some((file) => !/\.ya?ml$/.test(file) || !statSync(file).isFile())
) {
  throw new Error('Audit requires at least one YAML workflow file')
}
const tool = mode === 'lint' ? 'actionlint' : 'zizmor'
for (const required of mode === 'lint' ? [tool, 'shellcheck'] : [tool]) {
  if (!existsSync(path.join(bin, required))) {
    throw new Error('Run bun run ci:setup to install the pinned audit tools')
  }
}
const args =
  mode === 'lint'
    ? [
        '-color',
        '-shellcheck',
        path.join(bin, 'shellcheck'),
        '-pyflakes=',
        ...files,
      ]
    : [
        '--offline',
        '--strict-collection',
        mode === 'security-report' ? '--persona=auditor' : '--persona=pedantic',
        '--config',
        path.join(root, '.github/zizmor.yml'),
        ...(mode === 'security' ? ['--min-severity=medium'] : []),
        ...files,
      ]
const result = spawnSync(path.join(bin, tool), args, {
  cwd: root,
  stdio: 'inherit',
})
if (result.error) {
  throw result.error
}
process.exitCode = result.status ?? 1
