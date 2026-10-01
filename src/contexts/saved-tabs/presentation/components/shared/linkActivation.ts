import type { MouseEvent } from 'react'

type LinkActivationEvent = Pick<
  MouseEvent<HTMLAnchorElement>,
  'altKey' | 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey'
>

/** TABBIN handles only an unmodified primary activation of a saved URL link. */
const isManagedLinkActivation = (event: LinkActivationEvent): boolean =>
  event.button === 0 &&
  !event.altKey &&
  !event.ctrlKey &&
  !event.metaKey &&
  !event.shiftKey

export { isManagedLinkActivation }
