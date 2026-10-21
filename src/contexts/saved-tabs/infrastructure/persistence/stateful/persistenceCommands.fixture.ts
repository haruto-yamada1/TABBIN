import * as fc from 'fast-check'

import type { PersistenceLogicalSnapshot } from '@/contexts/saved-tabs/application/ports/PersistenceV2SnapshotReaderPort'
import { inspectBackupV2 } from '@/features/options/lib/import-export/v2/BackupV2Inspector'

import {
  assertPersistenceModel,
  assertSavedTabsRoundTrip,
  copyModelState,
  invariant,
  URL_CASES,
} from './persistenceModel.fixture'
import type { PersistenceModel, ModelUrl } from './persistenceModel.fixture'
import { createPersistenceRuntime } from './persistenceRuntime.fixture'
import type { PersistenceRuntime } from './persistenceRuntime.fixture'

export type CommandKind =
  | 'save'
  | 'resave'
  | 'move'
  | 'category'
  | 'delete'
  | 'undo'
  | 'export'
  | 'import'
  | 'invalid-save'
  | 'invalid-move'
  | 'invalid-import'
const rejects = async (operation: () => Promise<unknown>): Promise<void> => {
  let rejected = false
  try {
    await operation()
  } catch {
    rejected = true
  }
  invariant(rejected, 'EXPECTED_REJECTION')
}

type CommandContext = {
  command: PersistenceCommand
  model: PersistenceModel
  real: PersistenceRuntime
  canonical: string
  raw: string
  previous: ModelUrl | undefined
  before: PersistenceLogicalSnapshot
}

const moveOperation = async (context: CommandContext): Promise<void> => {
  invariant(context.previous !== undefined, 'MISSING_MODEL_URL')
  const target = `p${context.command.target}`
  await context.real.useCases.moveUrlBetweenCustomProjects({
    sourceProjectId: context.previous.project,
    targetProjectId: target,
    url: context.canonical,
  })
  context.previous.project = target
  context.previous.category = null
  context.previous.customAdded = 1000
}

const categoryOperation = async (context: CommandContext): Promise<void> => {
  invariant(context.previous !== undefined, 'MISSING_MODEL_URL')
  // The two named projects already own their category; uncategorized is moved first.
  if (context.previous.project === 'custom-uncategorized') {
    await context.real.useCases.moveUrlBetweenCustomProjects({
      sourceProjectId: context.previous.project,
      targetProjectId: `p${context.command.target}`,
      url: context.canonical,
    })
    context.previous.project = `p${context.command.target}`
    context.previous.customAdded = 1000
  }
  await context.real.useCases.setCustomProjectUrlCategory({
    projectId: context.previous.project,
    url: context.canonical,
    category: 'category',
  })
  context.previous.category = context.previous.project === 'p0' ? 'c0' : 'c1'
}

const deleteOperation = async (context: CommandContext): Promise<void> => {
  context.model.undo = copyModelState(context.model.state)
  context.real.undo = context.before
  await context.real.dataPlane.removeUrl(context.canonical)
  context.model.state.urls.delete(context.command.slot)
}

const undoOperation = async (context: CommandContext): Promise<void> => {
  invariant(
    context.model.undo !== null && context.real.undo !== null,
    'UNDO_MISSING',
  )
  await context.real.dataPlane.restoreUndoSnapshot(context.real.undo)
  invariant(
    JSON.stringify(
      (await context.real.reader.readConsistentSnapshot()).savedTabs,
    ) === JSON.stringify(context.real.undo.savedTabs),
    'UNDO_METADATA',
  )
  context.model.state = copyModelState(context.model.undo)
  context.model.undo = null
  context.real.undo = null
}

const exportOperation = async (context: CommandContext): Promise<void> => {
  context.real.backupSnapshot = context.before
  context.real.backup = await context.real.exportBackup()
  context.model.backup = copyModelState(context.model.state)
  // Exercise serialized public schema and stable logical-data ordering.
  invariant(
    JSON.stringify(
      inspectBackupV2(JSON.stringify(context.real.backup)).data,
    ) === JSON.stringify(context.real.backup.data),
    'BACKUP_SCHEMA',
  )
  invariant(
    JSON.stringify(context.real.backup.data) ===
      JSON.stringify((await context.real.exportBackup()).data),
    'BACKUP_ORDER',
  )
}

const importOperation = async (context: CommandContext): Promise<void> => {
  invariant(
    context.real.backup !== null && context.model.backup !== null,
    'BACKUP_MISSING',
  )
  await context.real.importBackup(
    inspectBackupV2(JSON.stringify(context.real.backup)),
  )
  invariant(context.real.backupSnapshot !== null, 'BACKUP_BASELINE_MISSING')
  assertSavedTabsRoundTrip(
    context.real.backupSnapshot.savedTabs,
    (await context.real.reader.readConsistentSnapshot()).savedTabs,
  )
  context.model.state = copyModelState(context.model.backup)
}

const invalid_saveOperation = async (
  context: CommandContext,
): Promise<void> => {
  await context.real.dataPlane.saveTabs([
    { url: 'synthetic-invalid-url', title: 'invalid' },
  ])
}

const invalid_moveOperation = async (
  context: CommandContext,
): Promise<void> => {
  invariant(context.previous !== undefined, 'MISSING_MODEL_URL')
  const sourceProjectId = context.previous.project
  await rejects(async () =>
    context.real.useCases.moveUrlBetweenCustomProjects({
      sourceProjectId,
      targetProjectId: 'missing-project',
      url: context.canonical,
    }),
  )
}

const invalid_importOperation = async (
  context: CommandContext,
): Promise<void> => {
  const backup = await context.real.exportBackup()
  const invalid = {
    ...backup,
    data: {
      ...backup.data,
      savedTabs: {
        ...backup.data.savedTabs,
        memberships: [
          ...backup.data.savedTabs.memberships,
          {
            addedAt: 1,
            updatedAt: 1,
            sortOrder: 0,
            urlId: 'missing-url',
            collectionId: 'p0',
          },
        ],
      },
    },
  }
  await rejects(async () => context.real.importBackup(inspectBackupV2(invalid)))
}

const saveOperation = async (context: CommandContext): Promise<void> => {
  const title = `Title ${context.command.target}`
  // Repeated equivalent input in the same batch must yield one URL identity.
  await context.real.dataPlane.saveTabs([
    { url: context.raw, title },
    { url: context.canonical, title },
  ])
  const snapshot = await context.real.reader.readVerifiedSavedTabsSnapshot()
  const created = snapshot.savedTabs.urls.find(
    (row) => row.url === context.canonical,
  )
  invariant(created !== undefined, 'SAVE_MISSING_URL')
  // Bind only the opaque identifier of a new entity; all state is context.model-owned.
  invariant(context.real.allocatedIds.has(created.id), 'SAVE_UNKNOWN_ID')
  context.model.state.urls.set(context.command.slot, {
    id: context.previous?.id ?? created.id,
    title,
    first: context.previous?.first ?? context.real.clock.time,
    last: context.real.clock.time,
    customAdded: context.real.clock.time,
    project: 'custom-uncategorized',
    category: null,
  })
  context.model.state.hasUncategorized = true
}

const operations: Record<
  CommandKind,
  (context: CommandContext) => Promise<void>
> = {
  save: saveOperation,
  resave: saveOperation,
  move: moveOperation,
  category: categoryOperation,
  delete: deleteOperation,
  undo: undoOperation,
  export: exportOperation,
  import: importOperation,
  'invalid-save': invalid_saveOperation,
  'invalid-move': invalid_moveOperation,
  'invalid-import': invalid_importOperation,
}

export class PersistenceCommand implements fc.AsyncCommand<
  PersistenceModel,
  PersistenceRuntime
> {
  readonly kind: CommandKind
  readonly slot: number
  readonly target: number
  constructor(kind: CommandKind, slot = 0, target = 0) {
    this.kind = kind
    this.slot = slot
    this.target = target
  }
  check(model: Readonly<PersistenceModel>): boolean {
    if (this.kind === 'undo') {
      return model.undo !== null
    }
    if (this.kind === 'import') {
      return model.backup !== null
    }
    if (
      ['resave', 'move', 'category', 'delete', 'invalid-move'].includes(
        this.kind,
      )
    ) {
      return model.state.urls.has(this.slot)
    }
    return true
  }
  toString(): string {
    return `${this.kind}(${this.slot},${this.target})`
  }
  async run(model: PersistenceModel, real: PersistenceRuntime): Promise<void> {
    const pair = URL_CASES[this.slot]
    invariant(pair !== undefined, 'INVALID_SYNTHETIC_SLOT')

    const [canonical, raw] = pair
    const previous = model.state.urls.get(this.slot)
    const before = await real.reader.readConsistentSnapshot()
    real.operations.push(this.toString())
    real.clock.time += 1
    await operations[this.kind]({
      command: this,
      model,
      real,
      canonical,
      raw,
      previous,
      before,
    })
    const after = await real.reader.readConsistentSnapshot()
    invariant(
      after.analyticsViews.length === 0 &&
        after.conversations.length === 0 &&
        after.messages.length === 0,
      'UNRELATED_STORE_MUTATION',
    )
    if (this.kind.startsWith('invalid-') || this.kind === 'export') {
      invariant(
        JSON.stringify(after) === JSON.stringify(before),
        'READ_OR_REJECT_MUTATED_STATE',
      )
    } else {
      invariant(after.revision >= before.revision, 'REVISION_REGRESSED')
      if (this.kind === 'import') {
        invariant(after.revision > before.revision, 'IMPORT_REVISION')
      }
    }
    assertPersistenceModel(after.savedTabs, model.state)
  }
}

export const commandArbitrary = fc
  .tuple(
    fc.constantFrom<CommandKind>(
      'save',
      'save',
      'resave',
      'move',
      'category',
      'delete',
      'undo',
      'export',
      'import',
      'invalid-save',
      'invalid-move',
      'invalid-import',
    ),
    fc.integer({ min: 0, max: URL_CASES.length - 1 }),
    fc.integer({ min: 0, max: 1 }),
  )
  .map(([kind, slot, target]) => new PersistenceCommand(kind, slot, target))

export const runCommands = async (
  commands: Iterable<fc.AsyncCommand<PersistenceModel, PersistenceRuntime>>,
  afterStep?: (
    real: PersistenceRuntime,
    model: PersistenceModel,
  ) => Promise<void>,
): Promise<void> => {
  const real = await createPersistenceRuntime()
  const model: PersistenceModel = {
    state: { urls: new Map(), hasUncategorized: false },
    undo: null,
    backup: null,
  }
  try {
    assertPersistenceModel(
      (await real.reader.readConsistentSnapshot()).savedTabs,
      model.state,
    )
    // Wrapping preserves fast-check's command preconditions and shrinking metadata.
    const wrapped = Array.from(commands, (command) => ({
      check: (state: Readonly<PersistenceModel>) => command.check(state),
      toString: () => command.toString(),
      run: async (state: PersistenceModel, system: PersistenceRuntime) => {
        await command.run(state, system)
        if (afterStep) {
          await afterStep(system, state)
        }
      },
    }))
    await fc.asyncModelRun(() => ({ model, real }), wrapped)
  } finally {
    real.manager.close()
  }
}

const positive = (name: string, fallback: number): number => {
  const input = process.env[name]
  if (input === undefined) {
    return fallback
  }
  invariant(
    /^[1-9][0-9]*$/.test(input) && Number.isSafeInteger(Number(input)),
    `INVALID_${name}`,
  )
  return Number(input)
}
const DEFAULT_RUNS = 100
const DEFAULT_COMMANDS = 40
const MIN_SEED = -2147483648
const MAX_SEED = 2147483647

const optionalValue = (name: string): string | undefined => {
  const value = process.env[name]
  return value === '' ? undefined : value
}
export const persistenceParameters = () => {
  const numRuns = positive('PERSISTENCE_FC_RUNS', DEFAULT_RUNS)
  const maxCommands = positive('PERSISTENCE_FC_COMMANDS', DEFAULT_COMMANDS)
  const seed = optionalValue('PERSISTENCE_FC_SEED')
  const path = optionalValue('PERSISTENCE_FC_PATH')
  const replayPath = optionalValue('PERSISTENCE_FC_REPLAY_PATH')
  if (seed !== undefined) {
    invariant(
      /^-?[0-9]+$/.test(seed) &&
        Number(seed) >= MIN_SEED &&
        Number(seed) <= MAX_SEED,
      'INVALID_SEED',
    )
  }
  if (path !== undefined) {
    invariant(/^[0-9]+(?::[0-9]+)*$/.test(path), 'INVALID_PATH')
  }
  if (replayPath !== undefined) {
    invariant(/^[A-Za-z0-9_+/=:-]+$/.test(replayPath), 'INVALID_REPLAY_PATH')
  }
  return {
    numRuns,
    maxCommands,
    ...(seed === undefined ? {} : { seed: Number(seed) }),
    ...(path === undefined ? {} : { path }),
    ...(replayPath === undefined ? {} : { replayPath }),
  }
}
export const commandTrace = <T>(details: fc.RunDetails<T>): string =>
  details.counterexample ? String(details.counterexample) : ''

export const failureSummary = <T>(details: fc.RunDetails<T>): string => {
  // Deliberately omit the original exception, snapshots, settings and arbitrary payloads.
  const trace = commandTrace(details)
  return JSON.stringify({
    code: 'PERSISTENCE_MODEL_FAILURE',
    seed: details.seed,
    path: details.counterexamplePath,
    shrinks: details.numShrinks,
    commands: trace,
  })
}
