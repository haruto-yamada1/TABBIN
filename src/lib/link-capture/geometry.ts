export type CaptureLink = { url: string; title: string }
export type CaptureRectangle = {
  left: number
  top: number
  right: number
  bottom: number
}
export type CaptureCandidate = {
  element: HTMLAnchorElement
  link: CaptureLink
}

const MAX_LINKS = 1000
const MAX_URL_LENGTH = 8192
const MAX_TITLE_LENGTH = 512

export const isCaptureEditable = (
  target: EventTarget | null | undefined,
): boolean =>
  target instanceof Element &&
  target.closest(
    'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="searchbox"],[role="spinbutton"]',
  ) !== null

const visible = (
  element: HTMLElement,
  cache: WeakMap<HTMLElement, boolean>,
): boolean => {
  const lineage: HTMLElement[] = []
  let current: HTMLElement | null = element
  while (current && !cache.has(current)) {
    lineage.push(current)
    current = current.parentElement
  }
  let result = current ? cache.get(current) !== false : true
  for (const ancestor of lineage.toReversed()) {
    const style = getComputedStyle(ancestor)
    result &&=
      !ancestor.matches('[hidden],[inert],[aria-disabled="true"]') &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.visibility !== 'collapse' &&
      style.opacity !== '0' &&
      style.contentVisibility !== 'hidden'
    cache.set(ancestor, result)
  }
  return result
}

const captureLink = (element: HTMLAnchorElement): CaptureLink | undefined => {
  const href = element.getAttribute('href')?.trim()
  if (!href || href.startsWith('#')) {
    return undefined
  }
  try {
    const url = new URL(href, element.ownerDocument.baseURI)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.href.length > MAX_URL_LENGTH
    ) {
      return undefined
    }
    const labels = [
      // Visible text excludes hidden descendants, unlike textContent.
      // eslint-disable-next-line unicorn/prefer-dom-node-text-content
      element.innerText.trim(),
      element.getAttribute('aria-label')?.trim(),
      element.title.trim(),
      element.querySelector('img')?.alt.trim(),
    ]
    const title = (labels.find(Boolean) ?? url.href)
      .replace(/\s+/g, ' ')
      .slice(0, MAX_TITLE_LENGTH)
    return { url: url.href, title }
  } catch {
    return undefined
  }
}

/** Rebuild only at gesture start or after page DOM changes. No page data leaves
 * this isolated world until the user explicitly completes a selection. */
export const collectCaptureCandidates = (
  pageDocument: Document,
): CaptureCandidate[] => {
  const candidates: CaptureCandidate[] = []
  for (const element of pageDocument.querySelectorAll('a[href]')) {
    if (!(element instanceof HTMLAnchorElement)) {
      continue
    }
    const link = captureLink(element)
    if (link) {
      candidates.push({ element, link })
    }
  }
  return candidates
}

const intersects = (a: CaptureRectangle, b: CaptureRectangle): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

const containingBlockProperties = [
  'transform',
  'translate',
  'rotate',
  'scale',
  'perspective',
  'filter',
  'backdrop-filter',
]

const establishesContainingBlock = (
  style: CSSStyleDeclaration,
  position: string,
): boolean => {
  if (
    position === 'absolute' &&
    style.position &&
    style.position !== 'static'
  ) {
    return true
  }
  return (
    containingBlockProperties.some((property) => {
      const value = style.getPropertyValue(property)
      return Boolean(value && value !== 'none')
    }) ||
    /(?:^|\s)(?:layout|paint|strict|content)(?:\s|$)/.test(style.contain) ||
    style.contentVisibility === 'auto' ||
    style.willChange
      .split(',')
      .some((property) => containingBlockProperties.includes(property.trim()))
  )
}

const clipFragments = (element: HTMLElement): CaptureRectangle[] => {
  let fragments: CaptureRectangle[] = Array.from(element.getClientRects())
  let ancestor = element.parentElement
  let position = getComputedStyle(element).position
  while (
    ancestor &&
    ancestor !== document.body &&
    ancestor !== document.documentElement
  ) {
    const style = getComputedStyle(ancestor)
    // Out-of-flow boxes (including wrappers around a link) escape overflow
    // between themselves and their containing block. Resume clipping there
    // and follow that box's own containing-block chain toward the viewport.
    if (
      ['absolute', 'fixed'].includes(position) &&
      !establishesContainingBlock(style, position)
    ) {
      ancestor = ancestor.parentElement
      continue
    }
    position = style.position
    const clipsX = /hidden|clip|auto|scroll/.test(
      style.overflowX || style.overflow,
    )
    const clipsY = /hidden|clip|auto|scroll/.test(
      style.overflowY || style.overflow,
    )
    if (clipsX || clipsY) {
      const bounds = ancestor.getBoundingClientRect()
      fragments = fragments.map((fragment) => ({
        left: clipsX ? Math.max(fragment.left, bounds.left) : fragment.left,
        right: clipsX ? Math.min(fragment.right, bounds.right) : fragment.right,
        top: clipsY ? Math.max(fragment.top, bounds.top) : fragment.top,
        bottom: clipsY
          ? Math.min(fragment.bottom, bounds.bottom)
          : fragment.bottom,
      }))
    }
    ancestor = ancestor.parentElement
  }
  return fragments
}

export const selectCaptureLinks = (
  candidates: readonly CaptureCandidate[],
  rectangle: CaptureRectangle,
): {
  links: CaptureLink[]
  rectangles: CaptureRectangle[]
  overflow: boolean
} => {
  const links = new Map<string, CaptureLink>()
  const rectangles: CaptureRectangle[] = []
  const visibility = new WeakMap<HTMLElement, boolean>()
  for (const { element, link } of candidates) {
    if (!element.isConnected || !visible(element, visibility)) {
      continue
    }
    const fragments = clipFragments(element).filter(
      (fragment) =>
        fragment.right > fragment.left &&
        fragment.bottom > fragment.top &&
        intersects(fragment, rectangle),
    )
    if (fragments.length === 0) {
      continue
    }
    links.set(link.url, link)
    if (links.size > MAX_LINKS) {
      return { links: [], rectangles: [], overflow: true }
    }
    rectangles.push(...fragments)
  }
  return { links: [...links.values()], rectangles, overflow: false }
}
