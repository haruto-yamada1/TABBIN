import { z } from 'zod'

export const backportTrackingIssueSchema = z
  .string()
  .regex(/^https:\/\/github\.com\/haruto-yamada1\/TABBIN\/issues\/[1-9]\d*$/)

const reviewSchema = z.strictObject({
  trackingIssue: backportTrackingIssueSchema,
  reviewedAt: z.iso.date(),
  expiresAt: z.iso.date(),
})
type BackportReview = z.infer<typeof reviewSchema>

// Existing approval is a trusted code anchor, never editable renewal metadata.
// Changing the anchor itself requires a separate security-policy review.
const existingApproval: BackportReview = Object.freeze({
  trackingIssue: 'https://github.com/haruto-yamada1/TABBIN/issues/924',
  reviewedAt: '2026-10-11',
  expiresAt: '2026-11-10',
})
// Approved renewals are appended in a reviewed PR, each with a new Issue.
const approvedBackportReviews: readonly BackportReview[] = [existingApproval]

export function verifyBackportReviewApproval(
  review: BackportReview,
  approvedHistory: readonly BackportReview[] = approvedBackportReviews,
): void {
  const history = z.array(reviewSchema).min(1).parse(approvedHistory)
  const first = history[0]
  if (
    !first ||
    first.trackingIssue !== existingApproval.trackingIssue ||
    first.reviewedAt !== existingApproval.reviewedAt ||
    first.expiresAt !== existingApproval.expiresAt
  ) {
    throw new Error(
      'Approved review history must preserve the existing review record',
    )
  }
  if (
    new Set(history.map((entry) => entry.trackingIssue)).size !== history.length
  ) {
    throw new Error('Each approved renewal requires a new tracking Issue')
  }
  for (const [index, entry] of history.entries()) {
    const previous = history[index - 1]
    if (
      previous &&
      (entry.reviewedAt <= previous.reviewedAt ||
        entry.expiresAt <= previous.expiresAt)
    ) {
      throw new Error('Approved review history must advance chronologically')
    }
  }
  const approved = history.at(-1)
  if (
    !approved ||
    review.trackingIssue !== approved.trackingIssue ||
    review.reviewedAt !== approved.reviewedAt ||
    review.expiresAt !== approved.expiresAt
  ) {
    throw new Error(
      'Backport review must match the approved record; renewal requires a new tracking Issue and approved review dates',
    )
  }
}
