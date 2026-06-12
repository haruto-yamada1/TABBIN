import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { deepEqual, isObject, joinPointer } from './io'
import { schemaRoot, stateStatuses } from './types'
import type {
  HarnessFileName,
  HarnessValidationIssue,
  JsonSchema,
  JsonValue,
} from './types'

const verificationSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['command', 'status', 'notes'],
  properties: {
    command: { type: 'string' },
    status: { type: 'string' },
    notes: { type: 'string' },
  },
}

const findingSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['severity', 'summary', 'evidence'],
  properties: {
    severity: { type: 'string' },
    summary: { type: 'string' },
    evidence: { type: 'string' },
  },
}

const checklistSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['requirement', 'evidence', 'status'],
  properties: {
    requirement: { type: 'string' },
    evidence: { type: 'string' },
    status: { type: 'string' },
  },
}

const planSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'title', 'owner', 'files', 'status'],
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    owner: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    status: { type: 'string' },
  },
}

const agentSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'role', 'responsibility', 'status'],
  properties: {
    name: { type: 'string' },
    role: { type: 'string' },
    responsibility: { type: 'string' },
    status: { type: 'string' },
  },
}

const scorecardSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'status', 'evidence', 'notes'],
  properties: {
    name: { type: 'string' },
    status: { type: 'string' },
    evidence: { type: 'string' },
    notes: { type: 'string' },
    score: { type: 'number' },
    max_score: { type: 'number' },
    findings: { type: 'array', items: { type: 'string' } },
  },
}

const learningSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['source', 'summary', 'status'],
  properties: {
    source: { type: 'string' },
    summary: { type: 'string' },
    status: { type: 'string' },
    target: { type: 'string' },
  },
}

const baseStateProperties: Record<string, JsonSchema> = {
  status: { type: 'string', enum: [...stateStatuses] },
  summary: { type: 'string' },
  updated_at: { type: 'string' },
  next_action: { type: 'string' },
  overall_score: { type: 'number' },
  top_actions: { type: 'array', items: { type: 'string' } },
  verification: { type: 'array', items: verificationSchema },
}

export const harnessSchemas: Record<HarnessFileName, JsonSchema> = {
  'orchestrator.json': {
    type: 'object',
    additionalProperties: false,
    required: [
      'status',
      'summary',
      'updated_at',
      'next_action',
      'plan',
      'agents',
      'verification',
    ],
    properties: {
      ...baseStateProperties,
      plan: { type: 'array', items: planSchema },
      agents: { type: 'array', items: agentSchema },
    },
  },
  'planner.json': {
    type: 'object',
    additionalProperties: false,
    required: [
      'status',
      'summary',
      'updated_at',
      'next_action',
      'role',
      'plan',
      'verification',
    ],
    properties: {
      ...baseStateProperties,
      role: { type: 'string' },
      plan: { type: 'array', items: planSchema },
    },
  },
  'generator.json': {
    type: 'object',
    additionalProperties: false,
    required: ['status', 'summary', 'updated_at', 'next_action'],
    properties: baseStateProperties,
  },
  'evaluator.json': {
    type: 'object',
    additionalProperties: false,
    required: [
      'status',
      'summary',
      'updated_at',
      'next_action',
      'findings',
      'checklist',
      'verification',
    ],
    properties: {
      ...baseStateProperties,
      findings: { type: 'array', items: findingSchema },
      checklist: { type: 'array', items: checklistSchema },
    },
  },
  'decision.json': {
    type: 'object',
    additionalProperties: false,
    required: ['status', 'summary', 'updated_at', 'next_action'],
    properties: baseStateProperties,
  },
  'scorecard.json': {
    type: 'object',
    additionalProperties: false,
    required: [
      'status',
      'summary',
      'updated_at',
      'next_action',
      'categories',
      'verification',
    ],
    properties: {
      ...baseStateProperties,
      categories: { type: 'array', items: scorecardSchema },
    },
  },
  'learning.json': {
    type: 'object',
    additionalProperties: false,
    required: [
      'status',
      'summary',
      'updated_at',
      'next_action',
      'candidates',
      'verification',
    ],
    properties: {
      ...baseStateProperties,
      candidates: { type: 'array', items: learningSchema },
    },
  },
}

export function writeHarnessSchemaFiles(projectRoot: string) {
  const outputRoot = path.join(projectRoot, schemaRoot)
  mkdirSync(outputRoot, { recursive: true })

  for (const [fileName, schema] of Object.entries(harnessSchemas)) {
    const schemaPath = path.join(
      outputRoot,
      fileName.replace('.json', '.schema.json'),
    )
    writeFileSync(
      schemaPath,
      `${JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', ...schema }, null, 2)}\n`,
    )
  }
}

// eslint-disable-next-line eslint/complexity
function validateJsonSchema(value: JsonValue, schema: JsonSchema, at = '/') {
  const issues: { message: string; path: string }[] = []

  if (schema.type && !matchesType(value, schema.type)) {
    issues.push({
      path: at,
      message: `型が不正です。期待値: ${schema.type}`,
    })
    return issues
  }

  if (schema.enum && !schema.enum.some((item) => deepEqual(item, value))) {
    issues.push({
      path: at,
      // eslint-disable-next-line typescript/no-base-to-string
      message: `許可されていない値です。許可値: ${schema.enum.join(', ')}`,
    })
  }

  if (schema.type === 'object' && isObject(value)) {
    for (const requiredKey of schema.required ?? []) {
      if (!(requiredKey in value)) {
        issues.push({
          path: joinPointer(at, requiredKey),
          message: '必須フィールドがありません。',
        })
      }
    }

    for (const [key, nestedValue] of Object.entries(value)) {
      const nestedSchema = schema.properties?.[key]
      if (!nestedSchema) {
        if (schema.additionalProperties === false) {
          issues.push({
            path: joinPointer(at, key),
            message: '未定義のフィールドです。',
          })
        }
        continue
      }

      issues.push(
        ...validateJsonSchema(nestedValue, nestedSchema, joinPointer(at, key)),
      )
    }
  }

  if (schema.type === 'array' && Array.isArray(value)) {
    const items = schema.items
    if (items) {
      value.forEach((item, index) => {
        issues.push(
          ...validateJsonSchema(item, items, joinPointer(at, String(index))),
        )
      })
    }
  }

  return issues
}

function matchesType(value: JsonValue, type: NonNullable<JsonSchema['type']>) {
  if (type === 'array') {
    return Array.isArray(value)
  }
  if (type === 'object') {
    return isObject(value)
  }
  return typeof value === type
}

function validationIssueLines(result: {
  issues: HarnessValidationIssue[]
  ok: boolean
}) {
  if (result.ok) {
    return ['- schema 検証は通過しました。']
  }

  return result.issues.map(
    (issue) => `- ${issue.file}${issue.path}: ${issue.message}`,
  )
}

export { matchesType, validationIssueLines, validateJsonSchema }
