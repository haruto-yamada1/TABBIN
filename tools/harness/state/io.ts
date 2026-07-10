import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { HarnessStateFile, JsonObject, JsonValue } from './types'

function writeJsonFile(filePath: string, value: unknown) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function readTextIfExists(filePath: string) {
  if (!existsSync(filePath)) {
    return null
  }

  return readFileSync(filePath, 'utf8')
}

function readStateIfExists(filePath: string): HarnessStateFile | null {
  if (!existsSync(filePath)) {
    return null
  }

  const parsed = readJsonFile(filePath)
  if (!parsed.ok || !isObject(parsed.value)) {
    return null
  }

  return parsed.value
}

function readJsonFile(
  filePath: string,
): { ok: true; value: JsonValue } | { message: string; ok: false } {
  try {
    // eslint-disable-next-line typescript/no-unsafe-assignment
    return { ok: true, value: JSON.parse(readFileSync(filePath, 'utf8')) }
  } catch (error) {
    return {
      ok: false,
      message: getErrorMessage(error),
    }
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function isObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepEqual(left: JsonValue, right: JsonValue) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function joinPointer(base: string, key: string) {
  const escaped = key.replaceAll('~', '~0').replaceAll('/', '~1')
  return base === '/' ? `/${escaped}` : `${base}/${escaped}`
}

function toProjectRelativePath(projectRoot: string, filePath: string) {
  const relative = path.relative(projectRoot, filePath)
  return relative.length > 0 ? relative : '.'
}

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
}
