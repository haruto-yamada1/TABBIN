import { z } from 'zod'

const source =
  'github:digitalbazaar/forge#ceba34402e329f0365134f23fe19898756527d65'
const patchKey = 'node-forge@github:digitalbazaar/forge#ceba344'
const patchFile = 'patches/node-forge-null-parameters.patch'
const text = z.string().trim().min(1)
const policySchema = z.strictObject({
  schemaVersion: z.literal(1),
  nodeForgeBackport: z.strictObject({
    advisory: z.literal('GHSA-86w9-cpqp-85rv'),
    source: z.literal(source),
    patch: z.literal(patchFile),
    dependencyPath: text,
    owner: text,
    rationale: text,
    upstreamStatus: text,
    trackingIssue: z
      .string()
      .regex(/^https:\/\/github\.com\/haruto-yamada1\/TABBIN\/issues\/\d+$/),
    reviewedAt: z.iso.date(),
    expiresAt: z.iso.date(),
  }),
})
const packageSchema = z.object({
  devDependencies: z.object({ 'node-forge': z.literal(source) }),
  overrides: z.object({ 'node-forge': z.literal(source) }),
  patchedDependencies: z.object({ [patchKey]: z.literal(patchFile) }),
})

// This is a review deadline for the existing verified Git backport, never an
// advisory suppression. Bun still audits all npm dependencies without ignores.
export function verifySecurityAuditPolicy(
  policyInput: unknown,
  packageInput: unknown,
  now = new Date(),
): string {
  const policy = policySchema.parse(policyInput).nodeForgeBackport
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
  return `node-forge backport review valid until ${policy.expiresAt} 00:00 UTC (${policy.owner}); no advisory ignores`
}
