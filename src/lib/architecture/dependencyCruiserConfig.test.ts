import { execFileSync } from 'node:child_process'
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const projectRoot = path.resolve(import.meta.dirname, '../../..')
const configPath = path.join(projectRoot, '.dependency-cruiser.cjs')
const ciWorkflowPath = path.join(projectRoot, '.github/workflows/ci.yml')
const oxlintConfigPath = path.join(projectRoot, '.oxlintrc.json')
const depcruisePath = path.join(
  projectRoot,
  'node_modules/.bin/dependency-cruise',
)
const fixtureDirectories: string[] = []

type FixtureFiles = Readonly<Record<string, string>>

const createFixture = (files: FixtureFiles) => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'tabbin-depcruise-'))
  fixtureDirectories.push(fixtureRoot)

  writeFileSync(
    path.join(fixtureRoot, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { moduleResolution: 'Bundler' } }),
  )
  cpSync(configPath, path.join(fixtureRoot, '.dependency-cruiser.cjs'))
  symlinkSync(
    path.join(projectRoot, 'node_modules'),
    path.join(fixtureRoot, 'node_modules'),
  )

  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(fixtureRoot, relativePath)
    mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, contents)
  }

  return fixtureRoot
}

const cruise = (files: FixtureFiles) => {
  const fixtureRoot = createFixture(files)

  try {
    execFileSync(
      depcruisePath,
      ['--config', '.dependency-cruiser.cjs', 'src', '--output-type', 'err'],
      { cwd: fixtureRoot, encoding: 'utf8', stdio: 'pipe' },
    )
    return { status: 0, output: '' }
  } catch (error) {
    const result = error as {
      stderr?: string
      stdout?: string
      status?: number
    }
    return {
      status: result.status ?? 1,
      output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    }
  }
}

const removeUndefinedFiles = (
  files: Readonly<Record<string, string | undefined>>,
): FixtureFiles => {
  const definedFiles: Record<string, string> = {}
  for (const [filePath, contents] of Object.entries(files)) {
    if (contents !== undefined) {
      definedFiles[filePath] = contents
    }
  }
  return definedFiles
}

afterEach(() => {
  for (const fixtureDirectory of fixtureDirectories.splice(0)) {
    rmSync(fixtureDirectory, { recursive: true, force: true })
  }
})

describe('dependency-cruiser architecture rules', () => {
  it.each([
    {
      name: 'circular dependencies',
      rule: 'no-circular',
      files: {
        'src/a.ts': "import './b'\n",
        'src/b.ts': "import './a'\n",
      },
    },
    {
      name: 'unresolved dependencies',
      rule: 'no-unresolvable',
      files: { 'src/a.ts': "import './missing'\n" },
    },
    {
      name: 'domain dependencies on React (ui-packages)',
      rule: 'no-domain-to-ui-packages',
      files: {
        'src/contexts/foo/domain/entity.ts': "import 'react'\n",
      },
    },
    {
      name: 'domain dependencies on react-router-dom',
      rule: 'no-domain-to-ui-packages',
      files: {
        'src/contexts/foo/domain/entity.ts': "import 'react-router-dom'\n",
      },
    },
    {
      name: 'domain dependencies on sonner',
      rule: 'no-domain-to-ui-packages',
      files: {
        'src/contexts/foo/domain/entity.ts': "import 'sonner'\n",
      },
    },
    {
      name: 'domain dependencies on lucide-react',
      rule: 'no-domain-to-ui-packages',
      files: {
        'src/contexts/foo/domain/entity.ts': "import 'lucide-react'\n",
      },
    },
    {
      name: 'domain dependencies on @radix-ui scoped package',
      rule: 'no-domain-to-ui-packages',
      files: {
        'src/contexts/foo/domain/entity.ts':
          "import '@radix-ui/react-dialog'\n",
      },
    },
    {
      name: 'domain dependencies on @dnd-kit scoped package',
      rule: 'no-domain-to-ui-packages',
      files: {
        'src/contexts/foo/domain/entity.ts': "import '@dnd-kit/core'\n",
      },
    },
    {
      name: 'domain dependencies on motion',
      rule: 'no-domain-to-ui-packages',
      files: {
        'src/contexts/foo/domain/entity.ts': "import 'motion'\n",
      },
    },
    {
      name: 'domain dependencies on shared UI',
      rule: 'no-domain-to-ui',
      files: {
        'src/components/Button.ts': 'export const Button = 1\n',
        'src/contexts/foo/domain/entity.ts':
          "import '../../../components/Button'\n",
      },
    },
    {
      name: 'domain dependencies on shared storage types',
      rule: 'no-domain-to-storage-types',
      files: {
        'src/types/storage.ts': 'export const storageType = 1\n',
        'src/contexts/foo/domain/entity.ts':
          "import '../../../types/storage'\n",
      },
    },
    {
      name: 'domain dependencies on outer layers',
      rule: 'no-domain-to-outer-layer',
      files: {
        'src/contexts/foo/application/useCase.ts': 'export const useCase = 1\n',
        'src/contexts/foo/domain/entity.ts':
          "import '../application/useCase'\n",
      },
    },
    {
      name: 'domain dependencies on logging runtime',
      rule: 'no-domain-application-to-logging',
      files: {
        'src/contexts/foo/domain/entity.ts':
          "import '../../../lib/logging/logger'\n",
        'src/lib/logging/logger.ts': 'export const logger = 1\n',
      },
    },
    {
      name: 'application dependencies on logging runtime',
      rule: 'no-domain-application-to-logging',
      files: {
        'src/contexts/foo/application/useCase.ts':
          "import '../../../lib/logging/logger'\n",
        'src/lib/logging/logger.ts': 'export const logger = 1\n',
      },
    },
    {
      name: 'application dependencies on infrastructure',
      rule: 'no-infrastructure-construction-outside-composition',
      files: {
        'src/contexts/foo/application/useCase.ts':
          "import '../infrastructure/repository'\n",
        'src/contexts/foo/infrastructure/repository.ts':
          'export const repository = 1\n',
      },
    },
    {
      name: 'application dependencies on presentation',
      rule: 'no-application-to-presentation',
      files: {
        'src/contexts/foo/presentation/view.ts': 'export const view = 1\n',
        'src/contexts/foo/application/useCase.ts':
          "import '../presentation/view'\n",
      },
    },
    {
      name: 'application dependencies on React (ui-packages)',
      rule: 'no-application-to-ui-packages',
      files: {
        'src/contexts/foo/application/useCase.ts': "import 'react'\n",
      },
    },
    {
      name: 'application dependencies on react-router-dom',
      rule: 'no-application-to-ui-packages',
      files: {
        'src/contexts/foo/application/useCase.ts':
          "import 'react-router-dom'\n",
      },
    },
    {
      name: 'application dependencies on sonner',
      rule: 'no-application-to-ui-packages',
      files: {
        'src/contexts/foo/application/useCase.ts': "import 'sonner'\n",
      },
    },
    {
      name: 'application dependencies on lucide-react',
      rule: 'no-application-to-ui-packages',
      files: {
        'src/contexts/foo/application/useCase.ts': "import 'lucide-react'\n",
      },
    },
    {
      name: 'application dependencies on @radix-ui scoped package',
      rule: 'no-application-to-ui-packages',
      files: {
        'src/contexts/foo/application/useCase.ts':
          "import '@radix-ui/react-dialog'\n",
      },
    },
    {
      name: 'application dependencies on @dnd-kit scoped package',
      rule: 'no-application-to-ui-packages',
      files: {
        'src/contexts/foo/application/useCase.ts': "import '@dnd-kit/core'\n",
      },
    },
    {
      name: 'application dependencies on motion',
      rule: 'no-application-to-ui-packages',
      files: {
        'src/contexts/foo/application/useCase.ts': "import 'motion'\n",
      },
    },
    {
      name: 'application dependencies on shared UI',
      rule: 'no-application-to-ui',
      files: {
        'src/components/Button.ts': 'export const Button = 1\n',
        'src/contexts/foo/application/useCase.ts':
          "import '../../../components/Button'\n",
      },
    },
    {
      name: 'infrastructure dependencies on presentation',
      rule: 'no-infrastructure-to-presentation',
      files: {
        'src/contexts/foo/infrastructure/repository.ts':
          "import '../presentation/view'\n",
        'src/contexts/foo/presentation/view.ts': 'export const view = 1\n',
      },
    },
    {
      name: 'infrastructure dependencies on React',
      rule: 'no-infrastructure-to-react',
      files: {
        'src/contexts/foo/infrastructure/adapter.ts': "import 'react'\n",
      },
    },
    {
      name: 'infrastructure dependencies on shared UI',
      rule: 'no-infrastructure-to-ui',
      files: {
        'src/components/Button.ts': 'export const Button = 1\n',
        'src/contexts/foo/infrastructure/adapter.ts':
          "import '../../../components/Button'\n",
      },
    },
    {
      name: 'presentation dependencies on infrastructure',
      rule: 'no-infrastructure-construction-outside-composition',
      files: {
        'src/contexts/foo/infrastructure/repository.ts':
          'export const repository = 1\n',
        'src/contexts/foo/presentation/view.ts':
          "import '../infrastructure/repository'\n",
      },
    },
    {
      name: 'type-only presentation dependencies on infrastructure',
      rule: 'no-infrastructure-construction-outside-composition',
      files: {
        'src/contexts/foo/infrastructure/repository.ts':
          'export interface Repository {}\n',
        'src/contexts/foo/presentation/view.ts':
          "import type { Repository } from '../infrastructure/repository'\nexport type ViewRepository = Repository\n",
      },
    },
    {
      name: 'domain dependencies on infrastructure',
      rule: 'no-infrastructure-construction-outside-composition',
      files: {
        'src/contexts/foo/infrastructure/repository.ts':
          'export const repository = 1\n',
        'src/contexts/foo/domain/entity.ts':
          "import '../infrastructure/repository'\n",
      },
    },
    {
      name: 'shared utility dependencies on infrastructure',
      rule: 'no-infrastructure-construction-outside-composition',
      files: {
        'src/contexts/foo/infrastructure/repository.ts':
          'export const repository = 1\n',
        'src/lib/helper.ts':
          "import '../contexts/foo/infrastructure/repository'\n",
      },
    },
    {
      name: 'presentation dependencies on domain',
      rule: 'no-presentation-to-domain',
      files: {
        'src/contexts/foo/domain/entity.ts': 'export const entity = 1\n',
        'src/contexts/foo/presentation/view.ts': "import '../domain/entity'\n",
      },
    },
    {
      name: 'type-only presentation dependencies on domain',
      rule: 'no-presentation-to-domain',
      files: {
        'src/contexts/foo/domain/entity.ts':
          'export interface DomainEntity {}\n',
        'src/contexts/foo/presentation/view.ts':
          "import type { DomainEntity } from '../domain/entity'\nexport type ViewEntity = DomainEntity\n",
      },
    },
    {
      name: 'presentation test dependencies on domain',
      rule: 'no-presentation-tests-to-domain',
      files: {
        'src/contexts/foo/domain/entity.ts': 'export const entity = 1\n',
        'src/contexts/foo/presentation/view.test.ts':
          "import '../domain/entity'\n",
      },
    },
    {
      name: 'type-only presentation test dependencies on domain',
      rule: 'no-presentation-tests-to-domain',
      files: {
        'src/contexts/foo/domain/entity.ts':
          'export interface DomainEntity {}\n',
        'src/contexts/foo/presentation/view.test.tsx':
          "import type { DomainEntity } from '../domain/entity'\nexport type ViewEntity = DomainEntity\n",
      },
    },
    {
      name: 'direct dependencies on another context internal file',
      rule: 'no-foo-to-other-context-internal',
      files: {
        'src/contexts/bar/domain/entity.ts': 'export const entity = 1\n',
        'src/contexts/foo/domain/entity.ts':
          "import '../../bar/domain/entity'\n",
      },
    },
    {
      name: 'type-only direct dependencies on another context internal file',
      rule: 'no-foo-to-other-context-internal',
      files: {
        'src/contexts/bar/domain/entity.ts':
          'export interface OtherContextEntity {}\n',
        'src/contexts/foo/domain/entity.ts':
          "import type { OtherContextEntity } from '../../bar/domain/entity'\nexport type FooEntity = OtherContextEntity\n",
      },
    },
    {
      name: 'legacy feature dependencies on context domain',
      rule: 'no-legacy-features-to-context-internals',
      files: {
        'src/contexts/saved-tabs/domain/entity.ts': 'export const entity = 1\n',
        'src/features/foo/bar.ts':
          "import '../../contexts/saved-tabs/domain/entity'\n",
      },
    },
    {
      name: 'legacy feature dependencies on context application',
      rule: 'no-legacy-features-to-context-internals',
      files: {
        'src/contexts/saved-tabs/application/useCase.ts':
          'export const useCase = 1\n',
        'src/features/foo/bar.ts':
          "import '../../contexts/saved-tabs/application/useCase'\n",
      },
    },
    {
      name: 'legacy feature dependencies on context infrastructure',
      rule: 'no-legacy-features-to-context-internals',
      files: {
        'src/contexts/saved-tabs/infrastructure/repo.ts':
          'export const repo = 1\n',
        'src/features/foo/bar.ts':
          "import '../../contexts/saved-tabs/infrastructure/repo'\n",
      },
    },
  ])('rejects $name with $rule', ({ files, rule }) => {
    const result = cruise(removeUndefinedFiles(files))

    expect(result.status).not.toBe(0)
    expect(result.output).toContain(rule)
  })

  it('allows dependencies that point inward from application to domain', () => {
    const result = cruise({
      'src/contexts/foo/application/useCase.ts': "import '../domain/entity'\n",
      'src/contexts/foo/domain/entity.ts': 'export const entity = 1\n',
    })

    expect(result).toEqual({ status: 0, output: '' })
  })

  it('allows cross-context import through public-api.ts', () => {
    const result = cruise({
      'src/contexts/bar/public-api.ts': 'export const barApi = 1\n',
      'src/contexts/foo/application/useCase.ts':
        "import '../../bar/public-api'\n",
    })

    expect(result).toEqual({ status: 0, output: '' })
  })

  it('allows legacy feature dependencies on context public API', () => {
    const result = cruise({
      'src/contexts/saved-tabs/public-api.ts':
        'export const savedTabsApi = 1\n',
      'src/features/foo/bar.ts':
        "import '../../contexts/saved-tabs/public-api'\n",
    })

    expect(result).toEqual({ status: 0, output: '' })
  })

  it('allows legacy feature dependencies on context presentation entry point', () => {
    const result = cruise({
      'src/contexts/saved-tabs/presentation/route.tsx':
        'export const SavedTabsRoute = 1\n',
      'src/features/foo/bar.ts':
        "import '../../contexts/saved-tabs/presentation/route'\n",
    })

    expect(result).toEqual({ status: 0, output: '' })
  })

  it('allows composition layer to wire infrastructure implementations', () => {
    const result = cruise({
      'src/contexts/foo/infrastructure/repository.ts':
        'export const repository = 1\n',
      'src/app/composition/wireRepositories.ts':
        "import '../../contexts/foo/infrastructure/repository'\n",
    })

    expect(result).toEqual({ status: 0, output: '' })
  })

  it('allows type-only cross-context import through public-api.ts', () => {
    const result = cruise({
      'src/contexts/bar/public-api.ts': 'export interface BarApi {}\n',
      'src/contexts/foo/application/useCase.ts':
        "import type { BarApi } from '../../bar/public-api'\nexport type FooApi = BarApi\n",
    })

    expect(result).toEqual({ status: 0, output: '' })
  })

  it('allows entrypoints to wire infrastructure implementations', () => {
    const result = cruise({
      'src/contexts/foo/infrastructure/repository.ts':
        'export const repository = 1\n',
      'src/entrypoints/background.ts':
        "import '../contexts/foo/infrastructure/repository'\n",
    })

    expect(result).toEqual({ status: 0, output: '' })
  })

  it('allows cross-context import to shared kernel', () => {
    const result = cruise({
      'src/contexts/shared/kernel.ts': 'export const sharedKernel = 1\n',
      'src/contexts/foo/application/useCase.ts':
        "import '../../shared/kernel'\n",
    })

    expect(result).toEqual({ status: 0, output: '' })
  })

  it('allows infrastructure to import from other infrastructure', () => {
    const result = cruise({
      'src/contexts/foo/infrastructure/repository.ts':
        'export const repository = 1\n',
      'src/contexts/foo/infrastructure/adapter.ts': "import './repository'\n",
    })

    expect(result).toEqual({ status: 0, output: '' })
  })

  it('keeps the configuration CommonJS-compatible', () => {
    expect(readFileSync(configPath, 'utf8')).toContain('module.exports')
  })

  it('keeps circular dependency enforcement out of oxlint', () => {
    expect(readFileSync(oxlintConfigPath, 'utf8')).not.toContain(
      'import/no-cycle',
    )
  })

  it('runs the architecture check in CI', () => {
    expect(readFileSync(ciWorkflowPath, 'utf8')).toContain(
      'run: bun run arch:check',
    )
  })
})
