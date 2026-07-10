const harnessRoot = '.agents/harness'
const runRoot = `${harnessRoot}/runs`
const schemaRoot = '.apm/harness/schemas'

const TOP_ACTIONS_DISPLAY_LIMIT = 3
const RUN_ID_SUFFIX_LENGTH = 8
const SCORE_PASSED = 10
const SCORE_REVIEW = 4
const LINE_PREFIX_OFFSET = 3

const stateStatuses = [
  'pending',
  'running',
  'done',
  'approved',
  'changes_requested',
  'blocked',
] as const

export type HarnessStateStatus = (typeof stateStatuses)[number]
export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export interface JsonObject {
  [key: string]: JsonValue
}

export interface JsonSchema {
  additionalProperties?: boolean
  enum?: JsonValue[]
  items?: JsonSchema
  properties?: Record<string, JsonSchema>
  required?: string[]
  type?: 'array' | 'boolean' | 'number' | 'object' | 'string'
}

export type HarnessFileName =
  | 'orchestrator.json'
  | 'planner.json'
  | 'generator.json'
  | 'evaluator.json'
  | 'decision.json'
  | 'scorecard.json'
  | 'learning.json'

export interface HarnessValidationIssue {
  file: string
  message: string
  path: string
}

export interface HarnessValidationResult {
  issues: HarnessValidationIssue[]
  ok: boolean
  runDirectory: string | null
  runId: string | null
}

export interface VerificationRecord {
  command?: string
  notes?: string
  status?: string
}

export interface FindingRecord {
  evidence?: string
  severity?: string
  summary?: string
}

export interface ChecklistRecord {
  evidence?: string
  requirement?: string
  status?: string
}

export interface ScorecardRecord {
  evidence?: string
  findings?: string[]
  max_score?: number
  name?: string
  notes?: string
  score?: number
  status?: string
}

export interface LearningRecord {
  target?: string
  source?: string
  status?: string
  summary?: string
}

export interface SecurityFinding {
  file: string
  severity: string
  summary: string
}

export interface HarnessStateFile {
  agents?: AgentRecord[]
  candidates?: LearningRecord[]
  categories?: ScorecardRecord[]
  checklist?: ChecklistRecord[]
  findings?: FindingRecord[]
  next_action?: string
  overall_score?: number
  plan?: PlanRecord[]
  role?: string
  top_actions?: string[]
  status?: HarnessStateStatus
  summary?: string
  updated_at?: string
  verification?: VerificationRecord[]
}

export interface AgentRecord {
  name?: string
  responsibility?: string
  role?: string
  status?: string
}

export interface PlanRecord {
  files?: string[]
  id?: string
  owner?: string
  status?: string
  title?: string
}

export interface HarnessSnapshot {
  decision: HarnessStateFile | null
  evaluator: HarnessStateFile | null
  generator: HarnessStateFile | null
  learning: HarnessStateFile | null
  orchestrator: HarnessStateFile | null
  planner: HarnessStateFile | null
  runDirectory: string
  runId: string
  scorecard: HarnessStateFile | null
  task: string | null
}

export interface HarnessRunOptions {
  projectRoot: string
  runId?: string
}

export interface InitializeHarnessRunOptions {
  projectRoot: string
  runId?: string
  task: string
}

export interface InitializeHarnessRunResult {
  runDirectory: string
  runId: string
}

export interface HarnessGovernanceEvent {
  kind: string
  message: string
  severity: string
  source: string
}

export interface HarnessFileResult {
  path: string
}

export interface HarnessPlanOptions extends HarnessRunOptions {
  nextAction?: string
  summary?: string
  tasks?: string[]
}

export interface HarnessCheckpointOptions extends HarnessRunOptions {
  command: string
  nextAction?: string
  notes: string
  status: string
  summary?: string
}

export interface HarnessEvaluateOptions extends HarnessRunOptions {
  nextAction?: string
  summary?: string
}

export {
  harnessRoot,
  LINE_PREFIX_OFFSET,
  RUN_ID_SUFFIX_LENGTH,
  runRoot,
  schemaRoot,
  SCORE_PASSED,
  SCORE_REVIEW,
  stateStatuses,
  TOP_ACTIONS_DISPLAY_LIMIT,
}
