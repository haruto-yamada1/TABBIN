import { createHash } from 'node:crypto'

import { z } from 'zod'

import {
  reviewedNodeForgeRelease,
  verifyNodeForgeReleaseBinding,
} from './node-forge-release-policy'
import {
  backportTrackingIssueSchema,
  verifyBackportReviewApproval,
} from './security-audit-review-approvals'

const source =
  'github:digitalbazaar/forge#ceba34402e329f0365134f23fe19898756527d65'
const patchKey = 'node-forge@github:digitalbazaar/forge#ceba344'
const patchFile = 'patches/node-forge-null-parameters.patch'
const text = z.string().trim().min(1)
const backportPolicySchema = z.strictObject({
  schemaVersion: z.literal(1),
  nodeForgeBackport: z.strictObject({
    advisory: z.literal('GHSA-86w9-cpqp-85rv'),
    source: z.literal(source),
    patch: z.literal(patchFile),
    dependencyPath: text,
    owner: text,
    rationale: text,
    upstreamStatus: text,
    trackingIssue: backportTrackingIssueSchema,
    reviewedAt: z.iso.date(),
    expiresAt: z.iso.date(),
  }),
})
const releasePolicySchema = z.strictObject({
  schemaVersion: z.literal(2),
  nodeForgeRelease: z.strictObject({
    source: z.literal(reviewedNodeForgeRelease.source),
    version: z.literal(reviewedNodeForgeRelease.version),
    integrity: z.literal(reviewedNodeForgeRelease.integrity),
    dependencyPath: text,
    owner: z.literal('dependency maintenance / @haruto-yamada1'),
    rationale: text,
    upstreamEvidence: z.literal(
      'https://github.com/digitalbazaar/forge/blob/v1.4.3/CHANGELOG.md',
    ),
    verification: z.literal('bun run verify:node-forge-backport'),
    trackingIssue: z.literal(
      'https://github.com/haruto-yamada1/TABBIN/issues/1067',
    ),
    reviewedAt: z.literal('2026-11-10'),
  }),
})
const policySchema = z.discriminatedUnion('schemaVersion', [
  backportPolicySchema,
  releasePolicySchema,
])
const packageSchema = z.object({
  devDependencies: z.object({ 'node-forge': z.literal(source) }),
  overrides: z.object({ 'node-forge': z.literal(source) }),
  patchedDependencies: z.object({ [patchKey]: z.literal(patchFile) }),
})
const lockSchema = z.object({
  lockfileVersion: z.literal(1),
  workspaces: z.object({
    '': z.object({
      devDependencies: z.object({ 'node-forge': z.literal(source) }),
    }),
  }),
  overrides: z.object({ 'node-forge': z.literal(source) }),
  patchedDependencies: z.object({ [patchKey]: z.literal(patchFile) }),
  packages: z.record(z.string(), z.unknown()),
})
const resolutionSchema = z.tuple([
  z.literal(patchKey),
  z.strictObject({}),
  z.literal('digitalbazaar-forge-ceba344'),
  z.literal(
    'sha512-wQzUb9EXQPFuPFkcj/4B6mxSxkAbkRTgCJ7xEH61S0uBcaeUy3x0y7ppyHDW8xMGwsvkxgMzPaJH0hgWZHs4cQ==',
  ),
])

export function verifySecurityAuditArtifacts(
  lockInput: unknown,
  patchBytes?: Uint8Array,
): void {
  if (patchBytes === undefined) {
    // The shared binding verifier also accepts package manifests for the
    // preinstall guard. Audit artifacts must be an actual Bun lock snapshot.
    z.object({
      lockfileVersion: z.literal(1),
      packages: z.record(z.string(), z.unknown()),
    }).parse(lockInput)
    verifyNodeForgeReleaseBinding(lockInput)
    return
  }
  if (
    createHash('sha256').update(patchBytes).digest('hex') !==
    '66b0a5fbdb250c8faa4c2df38f3921bc39942e45491ad081bd452b906b067721'
  ) {
    throw new Error('node-forge patch digest differs from the approved bytes')
  }
  const lock = lockSchema.parse(lockInput)
  const resolutions = Object.entries(lock.packages).filter(
    ([key, entry]) =>
      key === 'node-forge' ||
      (key.endsWith('/node-forge') &&
        !key.split('/').at(-2)?.startsWith('@')) ||
      (Array.isArray(entry) &&
        typeof entry[0] === 'string' &&
        entry[0].startsWith('node-forge@')),
  )
  if (resolutions.length === 0) {
    throw new Error('node-forge lock binding is missing')
  }
  for (const [key, entry] of resolutions) {
    if (!resolutionSchema.safeParse(entry).success) {
      throw new Error(`node-forge lock binding is not approved: ${key}`)
    }
  }
}

// Both modes verify reviewed sources, never suppress advisories. The legacy
// backport retains its original expiry and approval requirements.
export function verifySecurityAuditPolicy(
  policyInput: unknown,
  packageInput: unknown,
  now = new Date(),
): string {
  const input = policySchema.parse(policyInput)
  if (input.schemaVersion === 2) {
    const policy = input.nodeForgeRelease
    verifyNodeForgeReleaseBinding(packageInput)
    if (
      !Number.isFinite(now.getTime()) ||
      Date.parse(`${policy.reviewedAt}T00:00:00Z`) > now.getTime()
    ) {
      throw new Error(
        'node-forge release review date is in the future or invalid',
      )
    }
    return `node-forge ${policy.version} npm release verified (${policy.owner}); no advisory ignores`
  }
  const policy = input.nodeForgeBackport
  packageSchema.parse(packageInput)
  const reviewed = Date.parse(`${policy.reviewedAt}T00:00:00Z`)
  const expires = Date.parse(`${policy.expiresAt}T00:00:00Z`)
  if (!Number.isFinite(now.getTime()) || reviewed > now.getTime()) {
    throw new Error(
      'node-forge backport review date is in the future or invalid',
    )
  }
  if (expires <= reviewed || expires - reviewed > 30 * 24 * 60 * 60 * 1000) {
    throw new Error('node-forge backport review must expire within 30 days')
  }
  if (now.getTime() >= expires) {
    throw new Error(
      `node-forge backport review expired at ${policy.expiresAt} 00:00 UTC; ` +
        `${policy.owner} must re-evaluate ${policy.trackingIssue}`,
    )
  }
  verifyBackportReviewApproval(policy)
  return `node-forge backport review valid until ${policy.expiresAt} 00:00 UTC (${policy.owner}); no advisory ignores`
}
