type ScrollTargetType = 'parent' | 'project' | 'domain' | 'child'
type ScrollDirection = 'previous' | 'next'

type ScrollControlAvailability = {
  bottom: boolean
  nextChild: boolean
  nextDomain: boolean
  nextParent: boolean
  nextProject: boolean
  previousChild: boolean
  previousDomain: boolean
  previousParent: boolean
  previousProject: boolean
  top: boolean
}

const SCROLL_TARGET_ATTRIBUTE = 'data-saved-tabs-scroll-target'
const POSITION_TOLERANCE = 1
const SCROLL_TARGET_OFFSET_PX = 96

const getScrollTargets = (
  container: HTMLElement,
  targetType: ScrollTargetType,
): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>(
    `[${SCROLL_TARGET_ATTRIBUTE}="${targetType}"]`,
  ),
]

const getRelativeScrollTarget = (
  container: HTMLElement,
  targetType: ScrollTargetType,
  direction: ScrollDirection,
): HTMLElement | null => {
  const containerTop = container.getBoundingClientRect().top
  const targetThreshold = containerTop + SCROLL_TARGET_OFFSET_PX
  const targets = getScrollTargets(container, targetType)

  if (direction === 'previous') {
    if (container.scrollTop <= POSITION_TOLERANCE) {
      return null
    }

    return (
      targets.findLast(
        (element) =>
          element.getBoundingClientRect().top <
          targetThreshold - POSITION_TOLERANCE,
      ) ?? null
    )
  }

  const isScrollable = container.scrollHeight > container.clientHeight
  if (
    isScrollable &&
    container.scrollTop + container.clientHeight >=
      container.scrollHeight - POSITION_TOLERANCE
  ) {
    return null
  }

  return (
    targets.find(
      (element) =>
        element.getBoundingClientRect().top >
        targetThreshold + POSITION_TOLERANCE,
    ) ?? null
  )
}

const getScrollControlAvailability = (
  container: HTMLElement,
): ScrollControlAvailability => {
  const isScrollable = container.scrollHeight > container.clientHeight
  const top = isScrollable && container.scrollTop > POSITION_TOLERANCE
  const bottom =
    isScrollable &&
    container.scrollTop + container.clientHeight <
      container.scrollHeight - POSITION_TOLERANCE

  return {
    bottom,
    nextChild: Boolean(getRelativeScrollTarget(container, 'child', 'next')),
    nextDomain: Boolean(getRelativeScrollTarget(container, 'domain', 'next')),
    nextParent: Boolean(getRelativeScrollTarget(container, 'parent', 'next')),
    nextProject: Boolean(getRelativeScrollTarget(container, 'project', 'next')),
    previousChild: Boolean(
      getRelativeScrollTarget(container, 'child', 'previous'),
    ),
    previousDomain: Boolean(
      getRelativeScrollTarget(container, 'domain', 'previous'),
    ),
    previousParent: Boolean(
      getRelativeScrollTarget(container, 'parent', 'previous'),
    ),
    previousProject: Boolean(
      getRelativeScrollTarget(container, 'project', 'previous'),
    ),
    top,
  }
}

const scrollContainerToTarget = (
  container: HTMLElement,
  target: HTMLElement,
): void => {
  const containerTop = container.getBoundingClientRect().top
  const targetTop = target.getBoundingClientRect().top
  const maxScrollTop = Math.max(
    0,
    container.scrollHeight - container.clientHeight,
  )
  const nextScrollTop = Math.min(
    maxScrollTop,
    Math.max(
      0,
      container.scrollTop + targetTop - containerTop - SCROLL_TARGET_OFFSET_PX,
    ),
  )

  container.scrollTo({
    behavior: 'smooth',
    top: nextScrollTop,
  })
}

export {
  SCROLL_TARGET_ATTRIBUTE,
  SCROLL_TARGET_OFFSET_PX,
  type ScrollControlAvailability,
  type ScrollDirection,
  type ScrollTargetType,
  getRelativeScrollTarget,
  getScrollControlAvailability,
  scrollContainerToTarget,
}
