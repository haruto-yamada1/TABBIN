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
export type JsonObject = {
  [key: string]: JsonValue
}

export type JsonSchema = {
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

export type HarnessValidationIssue = {
  file: string
  message: string
  path: string
}

export type HarnessValidationResult = {
  issues: HarnessValidationIssue[]
  ok: boolean
  runDirectory: string | null
  runId: string | null
}

export type VerificationRecord = {
  command?: string
  notes?: string
  status?: string
}

export type FindingRecord = {
  evidence?: string
  severity?: string
  summary?: string
}

export type ChecklistRecord = {
  evidence?: string
  requirement?: string
  status?: string
}

export type ScorecardRecord = {
  evidence?: string
  findings?: string[]
  max_score?: number
  name?: string
  notes?: string
  score?: number
  status?: string
}

export type LearningRecord = {
  target?: string
  source?: string
  status?: string
  summary?: string
}

export type SecurityFinding = {
  file: string
  severity: string
  summary: string
}

export type HarnessStateFile = {
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

export type AgentRecord = {
  name?: string
  responsibility?: string
  role?: string
  status?: string
}

export type PlanRecord = {
  files?: string[]
  id?: string
  owner?: string
  status?: string
  title?: string
}

export type HarnessSnapshot = {
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

export type HarnessRunOptions = {
  projectRoot: string
  runId?: string
}

export type InitializeHarnessRunOptions = {
  projectRoot: string
  runId?: string
  task: string
}

export type InitializeHarnessRunResult = {
  runDirectory: string
  runId: string
}

export type HarnessGovernanceEvent = {
  kind: string
  message: string
  severity: string
  source: string
}

export type HarnessFileResult = {
  path: string
}

export type HarnessPlanOptions = HarnessRunOptions & {
  nextAction?: string
  summary?: string
  tasks?: string[]
}

export type HarnessCheckpointOptions = HarnessRunOptions & {
  command: string
  nextAction?: string
  notes: string
  status: string
  summary?: string
}

export type HarnessEvaluateOptions = HarnessRunOptions & {
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
