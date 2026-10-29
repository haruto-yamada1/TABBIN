import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repository = process.cwd()
const ncuCli = path.join(
  path.dirname(
    fileURLToPath(import.meta.resolve('npm-check-updates/package.json')),
  ),
  'build/cli.js',
)
const parentPackage = 'tabbin-cooldown-parent'
const leafPackage = 'tabbin-cooldown-leaf'
const releaseAges = { '1.0.0': 30, '1.1.0': 8, '1.2.0': 6, '1.3.0': 1 }

const run = async (directory: string, command: string, args: string[]) =>
  new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(command, args, {
        cwd: directory,
        env: { ...process.env, NO_COLOR: '1', NO_UPDATE_NOTIFIER: '1' },
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString()
      })
      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })
      child.on('error', reject)
      child.on('close', (code) => resolve({ code, stdout, stderr }))
    },
  )

describe('dependency release cooldown', () => {
  it('applies the repository policy to ncu updates and Bun direct/transitive resolution', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'tabbin-cooldown-'))
    const publishedAt = Date.now()
    let registry = ''
    const server = createServer((request, response) => {
      const name = decodeURIComponent(
        new URL(request.url ?? '/', registry).pathname.slice(1),
      )
      if (![parentPackage, leafPackage].includes(name)) {
        response.writeHead(404).end()
        return
      }
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          name,
          'dist-tags': { latest: '1.3.0' },
          time: Object.fromEntries(
            Object.entries(releaseAges).map(([version, days]) => [
              version,
              new Date(publishedAt - days * 86_400_000).toISOString(),
            ]),
          ),
          versions: Object.fromEntries(
            Object.keys(releaseAges).map((version) => [
              version,
              {
                name,
                version,
                ...(name === parentPackage
                  ? { dependencies: { [leafPackage]: '^1.0.0' } }
                  : {}),
                dist: {
                  tarball: `${registry}/${name}/-/${name}-${version}.tgz`,
                },
              },
            ]),
          ),
        }),
      )
    })

    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', resolve)
      })
      const address = server.address()
      if (address === null || typeof address === 'string') {
        throw new Error('Cooldown registry must listen on a local TCP port')
      }
      registry = `http://127.0.0.1:${address.port}`
      await Promise.all(
        ['bunfig.toml', '.ncurc.json'].map(async (file) =>
          writeFile(
            path.join(directory, file),
            await readFile(path.join(repository, file)),
          ),
        ),
      )
      const packageFile = path.join(directory, 'package.json')
      const writePackage = async (version: string) =>
        writeFile(
          packageFile,
          JSON.stringify({
            name: 'cooldown-verification',
            private: true,
            dependencies: { [parentPackage]: version },
          }),
        )
      await writePackage('^1.0.0')
      const ncuArgs = [ncuCli, '--registry', registry, '--jsonUpgraded']
      const check = await run(directory, process.execPath, ncuArgs)
      expect(check).toMatchObject({ code: 0 })
      expect(JSON.parse(check.stdout)).toEqual({ [parentPackage]: '^1.1.0' })

      const control = await run(directory, process.execPath, [
        ...ncuArgs,
        '--cooldown',
        '0',
      ])
      expect(control).toMatchObject({ code: 0 })
      expect(JSON.parse(control.stdout)).toEqual({ [parentPackage]: '^1.3.0' })

      const upgrade = await run(directory, process.execPath, [
        ...ncuArgs,
        '--upgrade',
      ])
      expect(upgrade).toMatchObject({ code: 0 })
      const updatedPackage = JSON.parse(await readFile(packageFile, 'utf8'))
      expect(updatedPackage.dependencies[parentPackage]).toBe('^1.1.0')

      const bunArgs = [
        'install',
        '--registry',
        registry,
        '--lockfile-only',
        '--ignore-scripts',
        '--cache-dir',
        path.join(directory, 'cache'),
      ]
      const install = await run(directory, 'bun', bunArgs)
      expect(install).toMatchObject({ code: 0 })
      const lockFile = path.join(directory, 'bun.lock')
      const lock = await readFile(lockFile, 'utf8')
      expect(lock).toContain(`${parentPackage}@1.1.0`)
      expect(lock).toContain(`${leafPackage}@1.1.0`)
      expect(lock).not.toMatch(/tabbin-cooldown-(?:parent|leaf)@1\.[23]\.0/)

      await rm(lockFile)
      await writePackage('1.2.0')
      const blocked = await run(directory, 'bun', bunArgs)
      expect(blocked.code).not.toBe(0)
      expect(blocked.stderr).toMatch(/minimum|age|release|resolution/i)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await rm(directory, { recursive: true, force: true })
    }
  })
})
