import { z } from 'zod'

import { LINK_CAPTURE_MAX_BATCH_TEXT_LENGTH } from '@/constants/linkCapture'

export const LINK_CAPTURE_CONFIRM_THRESHOLD = 50
export const LINK_CAPTURE_MAX_LINKS = 1000
const MAX_LINK_URL_LENGTH = 8192
const MAX_LINK_TITLE_LENGTH = 512

export const linkCaptureMessageSchema = z
  .strictObject({
    action: z.enum(['previewLinkCapture', 'saveLinkCapture']),
    requestId: z.uuid(),
    links: z
      .array(
        z.strictObject({
          url: z.string().min(1).max(MAX_LINK_URL_LENGTH),
          title: z.string().max(MAX_LINK_TITLE_LENGTH),
        }),
      )
      .max(LINK_CAPTURE_MAX_LINKS),
    confirmed: z.boolean().optional(),
  })
  .refine(
    ({ links }) =>
      links.reduce(
        (size, link) => size + link.url.length + link.title.length,
        0,
      ) <= LINK_CAPTURE_MAX_BATCH_TEXT_LENGTH,
  )

export type LinkCaptureMessage = z.infer<typeof linkCaptureMessageSchema>
export type LinkCaptureLink = LinkCaptureMessage['links'][number]
export type LinkCaptureResponse = {
  readonly status:
    | 'ok'
    | 'confirmation_required'
    | 'forbidden'
    | 'invalid_message'
    | 'error'
  readonly saved: number
  readonly newCount: number
  readonly existing: number
  readonly excluded: number
  readonly duplicates: number
  readonly failed: number
}

export const emptyLinkCaptureResponse = (
  status: LinkCaptureResponse['status'],
): LinkCaptureResponse => ({
  status,
  saved: 0,
  newCount: 0,
  existing: 0,
  excluded: 0,
  duplicates: 0,
  failed: 0,
})

export const isLinkCaptureAction = (message: unknown): boolean => {
  if (typeof message !== 'object' || message === null) {
    return false
  }
  const action: unknown = Reflect.get(message, 'action')
  return action === 'previewLinkCapture' || action === 'saveLinkCapture'
}
