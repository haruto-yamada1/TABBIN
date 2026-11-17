import type {
  CaptureLink,
  CaptureRectangle,
  selectCaptureLinks,
} from './geometry'
import type { CaptureMessages } from './messages'

const rectangleStyle = (element: HTMLElement, rectangle: CaptureRectangle) => {
  Object.assign(element.style, {
    left: `${rectangle.left}px`,
    top: `${rectangle.top}px`,
    width: `${rectangle.right - rectangle.left}px`,
    height: `${rectangle.bottom - rectangle.top}px`,
  })
}

export const createCaptureOverlay = (pageDocument: Document) => {
  const host = pageDocument.createElement('div')
  host.dataset.tabbinLinkCapture = 'true'
  const shadow = host.attachShadow({ mode: 'open' })
  const style = pageDocument.createElement('style')
  style.textContent = `
:host{all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;color-scheme:light dark!important}
*{box-sizing:border-box} .box,.highlight{position:fixed;pointer-events:none;border:2px solid #7c3aed;background:rgb(124 58 237 / .12)}
.highlight{border:1px solid #7c3aed;background:rgb(124 58 237 / .2)}
.counter,.panel{font:14px/1.5 system-ui,sans-serif;color:light-dark(#171717,#fafafa);background:light-dark(#fff,#202020);border:1px solid #888;border-radius:10px;box-shadow:0 6px 28px #0004}
.counter{position:fixed;left:16px;bottom:16px;padding:8px 12px}
.panel{pointer-events:auto;position:fixed;right:16px;bottom:16px;max-width:min(460px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;padding:16px;overflow-wrap:anywhere}
.panel p{margin:0 0 12px} .panel ul{max-height:200px;overflow:auto;padding-left:20px} .panel button{font:inherit;padding:8px 14px;margin:4px;border:1px solid #777;border-radius:6px;background:light-dark(#f3f0ff,#332657);color:inherit;cursor:pointer}.panel button:focus-visible{outline:3px solid #8b5cf6;outline-offset:2px}
`
  shadow.append(style)
  pageDocument.documentElement.append(host)
  const selection = pageDocument.createElement('div')
  const counter = pageDocument.createElement('div')
  selection.className = 'box'
  counter.className = 'counter'
  counter.setAttribute('role', 'status')
  counter.setAttribute('aria-live', 'polite')
  let highlights: HTMLDivElement[] = []
  let panel: HTMLDivElement | undefined
  let previousFocus: Element | null = null
  const clearSelection = () => {
    selection.remove()
    counter.remove()
    for (const element of highlights) {
      element.remove()
    }
    highlights = []
    delete host.dataset.selectedCount
  }
  const clearPanel = () => {
    panel?.remove()
    panel = undefined
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
      previousFocus.focus({ preventScroll: true })
    }
    previousFocus = null
  }
  const dismiss = () => {
    clearSelection()
    clearPanel()
  }
  const showPanel = (
    text: string,
    actions: readonly { label: string; run: () => void }[],
    links?: readonly CaptureLink[],
  ) => {
    clearSelection()
    const hadPanel = Boolean(panel)
    panel?.remove()
    if (!hadPanel) {
      previousFocus = pageDocument.activeElement
    }
    panel = pageDocument.createElement('div')
    panel.className = 'panel'
    panel.setAttribute('role', actions.length > 1 ? 'dialog' : 'status')
    panel.setAttribute('aria-label', 'TABBIN')
    if (actions.length > 1) {
      panel.setAttribute('aria-modal', 'true')
    }
    const paragraph = pageDocument.createElement('p')
    paragraph.textContent = text
    panel.append(paragraph)
    if (links) {
      const list = pageDocument.createElement('ul')
      for (const link of links) {
        const item = pageDocument.createElement('li')
        item.textContent = `${link.title} — ${link.url}`
        list.append(item)
      }
      panel.append(list)
    }
    for (const action of actions) {
      const button = pageDocument.createElement('button')
      button.type = 'button'
      button.textContent = action.label
      button.addEventListener('click', (event) => {
        if (event.isTrusted) {
          action.run()
        }
      })
      panel.append(button)
    }
    panel.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab' || !panel) {
        return
      }
      const buttons = [...panel.querySelectorAll('button')]
      const first = buttons.at(0)
      const last = buttons.at(-1)
      if (event.shiftKey && shadow.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && shadow.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    })
    shadow.append(panel)
    if (actions.length > 1) {
      panel.querySelector('button')?.focus()
    }
    host.dataset.captureStatus = text
  }
  return {
    host,
    dismiss,
    clearSelection,
    showPanel,
    selection: (
      rectangle: CaptureRectangle,
      result: ReturnType<typeof selectCaptureLinks>,
      messages: CaptureMessages,
    ) => {
      const { rectangles: fragments, links, overflow } = result
      const count = links.length
      clearPanel()
      rectangleStyle(selection, rectangle)
      counter.textContent = overflow
        ? messages.overflow
        : `${messages.selected} ${count}`
      host.dataset.selectedCount = String(count)
      shadow.append(selection, counter)
      for (let index = 0; index < fragments.length; index += 1) {
        let highlight = highlights[index]
        if (!highlight) {
          highlight = pageDocument.createElement('div')
          highlight.className = 'highlight'
          shadow.append(highlight)
          highlights.push(highlight)
        }
        const fragment = fragments[index]
        if (fragment) {
          rectangleStyle(highlight, fragment)
        }
      }
      for (const highlight of highlights.splice(fragments.length)) {
        highlight.remove()
      }
    },
    remove: () => {
      dismiss()
      host.remove()
    },
  }
}
