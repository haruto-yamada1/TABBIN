const TARGET_POLL_MS = 100

/** Wait for a visible dynamic mount, never indefinitely. Does not click or change data. */
export const findVisibleGuideTarget = (
  selector: string,
): HTMLElement | null => {
  for (const element of document.querySelectorAll<HTMLElement>(selector)) {
    const style = getComputedStyle(element)
    if (
      element.isConnected &&
      element.getClientRects().length > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      !element.closest('[hidden]')
    ) {
      return element
    }
  }
  return null
}

export const waitForGuideTarget = async (
  selector: string,
  signal: AbortSignal,
  timeout = 4000,
): Promise<HTMLElement> =>
  new Promise((resolve, reject) => {
    let settled = false
    const finish = (element: HTMLElement | null) => {
      if (settled) {
        return
      }
      settled = true
      observer.disconnect()
      clearInterval(interval)
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      if (element) {
        resolve(element)
      } else {
        reject(new Error('Guide target unavailable'))
      }
    }
    const check = () => {
      const element = findVisibleGuideTarget(selector)
      if (element) {
        finish(element)
      }
    }
    const abort = () => {
      finish(null)
    }
    const observer = new MutationObserver(check)
    const interval = setInterval(check, TARGET_POLL_MS)
    const timer = setTimeout(abort, timeout)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    })
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) {
      abort()
    } else {
      check()
    }
  })
