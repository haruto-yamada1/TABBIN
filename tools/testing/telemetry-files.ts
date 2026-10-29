import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { parseReport } from './flake-report'
import type { Report } from './flake-report'

type Budget = { bytes: number; files: number }
const walk = (directory: string) => {
  const result = { files: [] as string[], unsafe: false, truncated: false }
  const directories = [directory]
  let visited = 0
  while (directories.length) {
    const current = directories.pop()
    if (!current) {
      break
    }
    const root = lstatSync(current)
    if (!root.isDirectory() || root.isSymbolicLink()) {
      result.unsafe = true
      continue
    }
    for (const name of readdirSync(current)) {
      if (++visited > 10_000) {
        result.truncated = true
        return result
      }
      const file = path.join(current, name)
      const stat = lstatSync(file)
      if (stat.isSymbolicLink()) {
        result.unsafe = true
        result.files.push(file)
      } else if (stat.isDirectory()) {
        directories.push(file)
      } else {
        result.files.push(file)
      }
    }
  }
  return result
}

export function readReports(
  directory: string,
  budget: Budget = { bytes: 30 * 1024 * 1024, files: 50 },
) {
  const result = {
    reports: [] as Report[],
    rejected: 0,
    truncated: false,
    missing: !existsSync(directory),
  }
  if (result.missing) {
    return result
  }
  let bytes = 0
  let files = 0
  const scanned = walk(directory)
  result.truncated = scanned.truncated
  for (const file of scanned.files) {
    if (!/^flake-[a-zA-Z0-9_.-]+\.json$/u.test(path.basename(file))) {
      continue
    }
    const stat = lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink()) {
      result.rejected++
      continue
    }
    if (
      ++files > budget.files ||
      stat.size > 5 * 1024 * 1024 ||
      bytes + stat.size > budget.bytes
    ) {
      result.truncated = true
      continue
    }
    bytes += stat.size
    try {
      result.reports.push(parseReport(JSON.parse(readFileSync(file, 'utf8'))))
    } catch {
      result.rejected++
    }
  }
  return result
}

export function inspectEvidence(
  directory: string,
  budget: Budget = { bytes: 50 * 1024 * 1024, files: 2000 },
) {
  const result = { available: false, files: 0, bytes: 0, reason: 'absent' }
  if (!existsSync(directory)) {
    return result
  }
  const scanned = walk(directory)
  if (scanned.unsafe) {
    return { ...result, reason: 'unsafe-file' }
  }
  if (scanned.truncated) {
    return { ...result, reason: 'budget-exceeded' }
  }
  for (const file of scanned.files) {
    if (!/(?:^|\/)trace\.zip$|\.(?:png|webm)$/u.test(file)) {
      continue
    }
    const stat = lstatSync(file)
    if (stat.isSymbolicLink() || !stat.isFile()) {
      return { ...result, reason: 'unsafe-file' }
    }
    result.files++
    result.bytes += stat.size
    if (result.files > budget.files || result.bytes > budget.bytes) {
      return { ...result, reason: 'budget-exceeded' }
    }
  }
  return {
    ...result,
    available: result.files > 0,
    reason: result.files > 0 ? 'bounded' : 'absent',
  }
}

type HistoryRun = {
  id: number
  event: string
  head_branch: string | null
  pull_requests: { number: number }[]
}
export function selectHistoryRuns<T extends HistoryRun>(
  runs: T[],
  currentRun: string,
  pr: number | undefined,
  limit = 25,
) {
  const selected = runs.filter(
    (run) =>
      String(run.id) !== currentRun &&
      ((run.event === 'push' && run.head_branch === 'develop') ||
        (run.event === 'pull_request' &&
          pr !== undefined &&
          run.pull_requests.some((item) => item.number === pr))),
  )
  return { runs: selected.slice(0, limit), truncated: selected.length > limit }
}
