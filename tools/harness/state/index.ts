// ハーネス state API
//
// 内部は責務単位で分割している。public な API は変えない。
//   - types     : 型 / 定数
//   - io        : ファイル I/O + JSON バリデーション
//   - schemas   : JSON schema 定義 + validator
//   - run       : run ライフサイクル (initialize/plan/checkpoint/evaluate/learn/validate)
//   - scorecard : surface audit + source-of-truth チェック
//   - learning  : security findings + learning 候補抽出
//   - markdown  : status / audit / repo / profile / surface / security の markdown 生成

export {
  buildHarnessAudit,
  buildHarnessProfile,
  buildHarnessRepoStatus,
  buildHarnessSecurityAudit,
  buildHarnessSurfaceAudit,
  buildHarnessStatusMarkdown,
  findingLines,
  listLines,
  nextActionLines,
  oneLine,
  schemaStatusForOptionalRun,
  stateSummaryLine,
  stateSummaryLines,
  verificationLines,
  writeHarnessStatusSnapshot,
} from './markdown'

export {
  buildSurfaceAuditCategories,
  collectChangedFiles,
  collectOrphanSkillFindings,
  collectSourceOfTruthFindings,
  findingsForCategory,
  readPackageScriptNames,
  summarizeScore,
  surfaceAuditCategoryNames,
  topActionLines,
} from './scorecard'

export {
  checkpointHarnessRun,
  defaultRunId,
  evaluateHarnessRun,
  harnessFileNames,
  initializeHarnessRun,
  learnFromHarnessRun,
  loadHarnessSnapshot,
  planHarnessRun,
  readActiveRun,
  recordHarnessGovernanceEvent,
  requireHarnessRun,
  resolveHarnessRun,
  validateHarnessRun,
} from './run'

export {
  collectLearningCandidates,
  collectSecurityFindings,
  learningTargetForFinding,
  learningTargetForSummary,
  listFiles,
  readGovernanceLearningCandidates,
  safeRead,
  securityRelevantContent,
} from './learning'

export {
  deepEqual,
  getErrorMessage,
  isObject,
  joinPointer,
  readJsonFile,
  readStateIfExists,
  readTextIfExists,
  toProjectRelativePath,
  writeJsonFile,
} from './io'

export {
  harnessSchemas,
  matchesType,
  validateJsonSchema,
  validationIssueLines,
  writeHarnessSchemaFiles,
} from './schemas'

export type {
  AgentRecord,
  ChecklistRecord,
  FindingRecord,
  HarnessCheckpointOptions,
  HarnessEvaluateOptions,
  HarnessFileName,
  HarnessFileResult,
  HarnessGovernanceEvent,
  HarnessPlanOptions,
  HarnessRunOptions,
  HarnessSnapshot,
  HarnessStateFile,
  HarnessStateStatus,
  HarnessValidationIssue,
  HarnessValidationResult,
  InitializeHarnessRunOptions,
  InitializeHarnessRunResult,
  JsonObject,
  JsonPrimitive,
  JsonSchema,
  JsonValue,
  LearningRecord,
  PlanRecord,
  ScorecardRecord,
  SecurityFinding,
  VerificationRecord,
} from './types'
