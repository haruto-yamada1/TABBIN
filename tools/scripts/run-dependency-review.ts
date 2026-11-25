import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

import JSON5 from 'json5'

import {
  readReviewedLicenseContents,
  verifyDependencyLicensePolicy,
} from './dependency-license-policy'
import {
  readPatchSnapshot,
  readReviewedPatchContents,
  reviewedNodeForgeBackport,
} from './dependency-patch-policy'
import { reviewDependencyChanges } from './dependency-review'
import type { ReviewRequest } from './dependency-review'

const basePath = process.env.BASE_LOCK
if (!basePath) {
  throw new Error('BASE_LOCK must point to the base commit bun.lock')
}

const request: ReviewRequest = async (url, init) => {
  const token = process.env.GITHUB_TOKEN
  return fetch(url, {
    ...init,
    headers:
      url.startsWith('https://api.github.com/') && token
        ? {
            authorization: `Bearer ${token}`,
            accept: 'application/vnd.github+json',
          }
        : {},
  })
}

const headContent = readFileSync('bun.lock', 'utf8')
const baseContent = readFileSync(basePath, 'utf8')
const base = readPatchSnapshot(JSON5.parse<unknown>(baseContent))
const basePatchContents: Record<string, string> = {}
if (
  base.patchedDependencies?.[reviewedNodeForgeBackport.dependency] ===
  reviewedNodeForgeBackport.path
) {
  const baseSha = process.env.BASE_SHA
  if (!baseSha || !/^[a-f\d]{40}$/i.test(baseSha)) {
    throw new Error(
      'BASE_SHA must identify the base commit for patch retirement',
    )
  }
  if (
    baseContent !==
    execFileSync('git', ['show', `${baseSha}:bun.lock`], { encoding: 'utf8' })
  ) {
    throw new Error('BASE_LOCK must match the declared BASE_SHA')
  }
  // Read the reviewed bytes from the base tree, never from the changed checkout.
  basePatchContents[reviewedNodeForgeBackport.path] = execFileSync(
    'git',
    ['show', `${baseSha}:${reviewedNodeForgeBackport.path}`],
    { encoding: 'utf8' },
  )
}
const headLock = JSON5.parse<unknown>(headContent)
const licenseContents = readReviewedLicenseContents(headLock)
verifyDependencyLicensePolicy(
  JSON.parse(readFileSync('package.json', 'utf8')),
  headLock,
  licenseContents,
)
const result = await reviewDependencyChanges(
  baseContent,
  headContent,
  request,
  readReviewedPatchContents(),
  licenseContents,
  new Date(),
  basePatchContents,
)
// JSON avoids treating untrusted dependency metadata as workflow commands.
const report = JSON.stringify(result, null, 2)
mkdirSync('.output/dependency-review', { recursive: true })
writeFileSync('.output/dependency-review/report.json', `${report}\n`)
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### Bun resolved dependency changes\n\n\`\`\`json\n${report}\n\`\`\`\n`,
  )
}
console.log(report)
if (result.findings.length) {
  process.exitCode = 1
}
