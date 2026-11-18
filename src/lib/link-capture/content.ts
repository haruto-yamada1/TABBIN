import { browser } from 'wxt/browser'

import {
  LINK_CAPTURE_MAX_BATCH_TEXT_LENGTH,
  LINK_CAPTURE_SETTINGS_KEY,
} from '@/constants/linkCapture'
import { matchLinkCaptureShortcut } from '@/lib/link-capture/shortcut'
import type { LinkCaptureShortcut } from '@/lib/link-capture/shortcut'
import { readLinkCaptureSettings } from '@/lib/storage/link-capture-settings'
import type { LinkCaptureSettings } from '@/lib/storage/link-capture-settings'
import type { LinkCaptureResponse } from '@/types/link-capture'

import {
  collectCaptureCandidates,
  isCaptureEditable,
  readClickedCaptureLink,
  selectCaptureLinks,
} from './geometry'
import type { CaptureCandidate, CaptureLink } from './geometry'
import { captureMessages } from './messages'
import type { CaptureMessages } from './messages'
import { createCaptureOverlay } from './overlay'
import { createCaptureRequestId } from './request-id'

const STATE_KEY = '__tabbinLinkCapture'
const DRAG_THRESHOLD = 6
const EDGE_DISTANCE = 36
const EDGE_SCROLL_SPEED = 18
const LARGE_BATCH_SIZE = 50
const CLICK_SUPPRESSION_MS = 300
const MAX_QUEUED_CLICKS = 1000

type Gesture = {
  pageX: number
  pageY: number
  pointerX: number
  pointerY: number
  pointerId: number
  active: boolean
}
type PendingBatch = {
  requestId: string
  links: CaptureLink[]
  confirmed: boolean
  mode: 'rectangle' | 'click'
}
type ClickGesture = {
  anchor: HTMLAnchorElement
  pointerId: number
  pageX: number
  pageY: number
  moved: boolean
  released: boolean
}

const interpolate = (template: string, values: Record<string, number>) =>
  template.replaceAll(/\{(\w+)\}/g, (match, key: string) =>
    String(values[key] ?? match),
  )
const modifierMatch = (
  event: Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>,
  shortcut: LinkCaptureShortcut,
) =>
  event.ctrlKey === shortcut.ctrlKey &&
  event.altKey === shortcut.altKey &&
  event.shiftKey === shortcut.shiftKey &&
  event.metaKey === shortcut.metaKey

const eventAnchor = (event: Event): HTMLAnchorElement | undefined =>
  event
    .composedPath()
    .find(
      (target): target is HTMLAnchorElement =>
        target instanceof HTMLAnchorElement && target.hasAttribute('href'),
    )
const editableFocus = (): boolean => {
  let active = document.activeElement
  while (active?.shadowRoot?.activeElement) {
    if (isCaptureEditable(active)) {
      return true
    }
    active = active.shadowRoot.activeElement
  }
  return isCaptureEditable(active)
}
const editableEvent = (event: Event): boolean =>
  event.composedPath().some(isCaptureEditable) || editableFocus()

class LinkCaptureController {
  private settings: LinkCaptureSettings | undefined
  private refreshRevision = 0
  private readonly overlay = createCaptureOverlay(document)
  private readonly events = new AbortController()
  private readonly observer = new MutationObserver((records) => {
    if (records.some(({ target }) => target !== this.overlay.host)) {
      this.candidatesDirty = true
      this.schedule()
    }
  })
  private candidates: CaptureCandidate[] = []
  private candidatesDirty = true
  private gesture: Gesture | undefined
  private keyHeld = false
  private clickKeyHeld = false
  private clickGesture: ClickGesture | undefined
  private readonly queuedClicks = new Map<string, CaptureLink>()
  private composing = false
  private frame = 0
  private lastSelection: ReturnType<typeof selectCaptureLinks> = {
    links: [],
    rectangles: [],
    overflow: false,
  }
  private pending: PendingBatch | undefined
  private busy = false
  private disposed = false
  private messages: CaptureMessages = captureMessages.en
  private suppressClickUntil = 0
  private dragToSuppress: number | undefined

  async initialize() {
    await this.refresh()
    if (this.disposed) {
      return
    }
    const options = { capture: true, signal: this.events.signal }
    window.addEventListener('keydown', this.keydown, options)
    window.addEventListener('keyup', this.keyup, options)
    window.addEventListener('pointerdown', this.pointerdown, options)
    window.addEventListener('pointermove', this.pointermove, options)
    window.addEventListener('pointerup', this.pointerup, options)
    window.addEventListener('pointercancel', this.cancelGesture, options)
    window.addEventListener('blur', this.cancelGesture, {
      ...options,
      capture: false,
    })
    window.addEventListener('pagehide', this.pagehide, options)
    window.addEventListener('pageshow', this.pageshow, options)
    window.addEventListener('popstate', this.cancel, options)
    window.addEventListener('hashchange', this.cancel, options)
    document.addEventListener('visibilitychange', this.cancelGesture, options)
    document.addEventListener(
      'compositionstart',
      this.compositionStart,
      options,
    )
    document.addEventListener('compositionend', this.compositionEnd, options)
    document.addEventListener('dragstart', this.preventNativeDrag, options)
    document.addEventListener('selectstart', this.preventNativeDrag, options)
    document.addEventListener('click', this.click, options)
    window.addEventListener('scroll', this.schedule, {
      ...options,
      passive: true,
    })
    window.addEventListener('resize', this.schedule, options)
    browser.storage.onChanged.addListener(this.storageChanged)
    browser.runtime.onMessage.addListener(this.message)
    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })
  }

  private readonly refresh = async (probe = false) => {
    const revision = ++this.refreshRevision
    this.cancel()
    try {
      const settings = await readLinkCaptureSettings()
      const values = await browser.storage.local.get('userSettings')
      const allowed = !probe || (await this.verifyAvailability(settings))
      if (!this.isRefreshCurrent(revision)) {
        return
      }
      if (!allowed) {
        this.dispose()
        return
      }
      this.messages = this.readMessages(values.userSettings)
      if (!this.disposed) {
        this.settings = settings
        if (!settings.enabled && !settings.clickEnabled) {
          this.dispose()
        }
      }
    } catch {
      if (this.isRefreshCurrent(revision)) {
        this.settings = undefined
        this.dispose()
      }
    }
  }
  private readMessages(userSettings: unknown): CaptureMessages {
    const language =
      typeof userSettings === 'object' &&
      userSettings !== null &&
      'language' in userSettings
        ? userSettings.language
        : 'system'
    const locale =
      language === 'system' ? browser.i18n.getUILanguage() : language
    return typeof locale === 'string' && locale.startsWith('ja')
      ? captureMessages.ja
      : captureMessages.en
  }
  private async verifyAvailability(
    settings: LinkCaptureSettings,
  ): Promise<boolean> {
    const response: LinkCaptureResponse | undefined =
      await browser.runtime.sendMessage({
        action: 'previewLinkCapture',
        mode: settings.enabled ? 'rectangle' : 'click',
        requestId: createCaptureRequestId(),
        links: [],
      })
    return response?.status === 'ok'
  }
  private readonly pagehide = (event: PageTransitionEvent) => {
    if (!event.persisted) {
      this.dispose()
      return
    }
    this.cancel()
    this.settings = undefined
    this.refreshRevision += 1
  }
  private readonly pageshow = (event: PageTransitionEvent) => {
    if (event.persisted) {
      void this.refresh(true)
    }
  }
  private isRefreshCurrent(revision: number): boolean {
    return revision === this.refreshRevision && !this.disposed
  }
  private readonly storageChanged = (
    changes: Record<string, unknown>,
    area: string,
  ) => {
    if (
      area === 'local' &&
      (Object.hasOwn(changes, LINK_CAPTURE_SETTINGS_KEY) ||
        Object.hasOwn(changes, 'userSettings'))
    ) {
      void this.refresh()
    }
  }
  private readonly message = (message: unknown, sender: { id?: string }) => {
    if (
      sender.id === browser.runtime.id &&
      typeof message === 'object' &&
      message !== null &&
      'action' in message &&
      message.action === 'linkCaptureDispose'
    ) {
      this.dispose()
    }
  }
  private readonly compositionStart = () => {
    this.composing = true
    this.cancelGesture()
  }
  private readonly compositionEnd = () => {
    this.composing = false
  }

  private readonly keydown = (event: KeyboardEvent) => {
    if (!event.isTrusted) {
      return
    }
    if (event.key === 'Escape') {
      if (this.gesture || this.pending) {
        event.preventDefault()
        event.stopImmediatePropagation()
        this.cancel()
      }
      return
    }
    if (!this.canUseKeyboard(event) || !this.settings) {
      return
    }
    if (this.keyHeld && !modifierMatch(event, this.settings.shortcut)) {
      this.cancelGesture()
    }
    if (
      this.settings.enabled &&
      matchLinkCaptureShortcut(event, this.settings.shortcut)
    ) {
      this.keyHeld = true
    }
    this.updateClickKey(event, this.settings)
    if (event.code === 'Enter' && this.keyHeld) {
      this.captureFocused(event)
    }
  }
  private updateClickKey(event: KeyboardEvent, settings: LinkCaptureSettings) {
    if (this.clickKeyHeld && !modifierMatch(event, settings.clickShortcut)) {
      this.clickKeyHeld = false
      this.clearClickGesture()
    }
    if (
      settings.clickEnabled &&
      matchLinkCaptureShortcut(event, settings.clickShortcut)
    ) {
      this.clickKeyHeld = true
    }
  }
  private canUseKeyboard(event: KeyboardEvent): boolean {
    return (
      (this.settings?.enabled === true ||
        this.settings?.clickEnabled === true) &&
      !this.composing &&
      !event.isComposing &&
      !editableEvent(event)
    )
  }
  private captureFocused(event: KeyboardEvent) {
    const focused = document.activeElement
    if (!(focused instanceof HTMLAnchorElement)) {
      return
    }
    event.preventDefault()
    event.stopImmediatePropagation()
    if (this.busy || this.pending || event.repeat) {
      return
    }
    const candidates = collectCaptureCandidates(document).filter(
      ({ element }) => element === focused,
    )
    const selection = selectCaptureLinks(
      candidates,
      focused.getBoundingClientRect(),
    )
    if (selection.links.length) {
      event.preventDefault()
      event.stopImmediatePropagation()
      void this.submit(selection.links)
    }
  }
  private readonly keyup = (event: KeyboardEvent) => {
    if (!event.isTrusted || !this.settings) {
      return
    }
    if (
      event.code === this.settings.shortcut.code ||
      !modifierMatch(event, this.settings.shortcut)
    ) {
      this.keyHeld = false
      this.clearRectangleGesture()
    }
    if (
      event.code === this.settings.clickShortcut.code ||
      !modifierMatch(event, this.settings.clickShortcut)
    ) {
      this.clickKeyHeld = false
      this.clearClickGesture()
    }
  }
  private readonly pointerdown = (event: PointerEvent) => {
    if (event.isTrusted) {
      // A fresh physical press is never the synthesized click ending a drag.
      this.suppressClickUntil = 0
      this.dragToSuppress = undefined
    }
    if (
      !event.isTrusted ||
      event.button !== 0 ||
      !event.isPrimary ||
      (event.pointerType && event.pointerType !== 'mouse')
    ) {
      return
    }
    this.startClickGesture(event)
    if (
      !this.keyHeld ||
      !this.settings?.enabled ||
      this.busy ||
      this.pending ||
      editableEvent(event) ||
      !modifierMatch(event, this.settings.shortcut)
    ) {
      return
    }
    this.gesture = {
      pageX: event.clientX + window.scrollX,
      pageY: event.clientY + window.scrollY,
      pointerX: event.clientX,
      pointerY: event.clientY,
      pointerId: event.pointerId,
      active: false,
    }
    this.candidatesDirty = true
  }
  private startClickGesture(event: PointerEvent) {
    this.clickGesture = undefined
    if (this.canClick(event)) {
      const anchor = eventAnchor(event)
      if (anchor) {
        this.clickGesture = {
          anchor,
          pageX: event.clientX + window.scrollX,
          pageY: event.clientY + window.scrollY,
          pointerId: event.pointerId,
          moved: false,
          released: false,
        }
      }
    }
  }
  private readonly pointermove = (event: PointerEvent) => {
    this.moveClickGesture(event)
    const gesture = this.gesture
    if (!event.isTrusted || !gesture || event.pointerId !== gesture.pointerId) {
      return
    }
    if ((event.buttons & 1) === 0) {
      this.cancelGesture()
      return
    }
    gesture.pointerX = event.clientX
    gesture.pointerY = event.clientY
    if (!gesture.active) {
      const distance = Math.hypot(
        event.clientX + window.scrollX - gesture.pageX,
        event.clientY + window.scrollY - gesture.pageY,
      )
      if (distance < DRAG_THRESHOLD) {
        return
      }
      gesture.active = true
      window.getSelection()?.removeAllRanges()
    }
    event.preventDefault()
    event.stopImmediatePropagation()
    this.schedule()
  }
  private readonly pointerup = (event: PointerEvent) => {
    if (event.isTrusted && this.dragToSuppress === event.pointerId) {
      this.suppressClickUntil = Date.now() + CLICK_SUPPRESSION_MS
      this.dragToSuppress = undefined
    }
    this.releaseClickGesture(event)
    if (
      !event.isTrusted ||
      !this.gesture ||
      event.pointerId !== this.gesture.pointerId
    ) {
      return
    }
    const active = this.gesture.active
    if (active) {
      this.clickGesture = undefined
    }
    if (!active) {
      this.gesture = undefined
      return
    }
    event.preventDefault()
    event.stopImmediatePropagation()
    this.gesture.pointerX = event.clientX
    this.gesture.pointerY = event.clientY
    this.renderSelection()
    const selection = this.lastSelection
    this.gesture = undefined
    this.suppressClickUntil = Date.now() + CLICK_SUPPRESSION_MS
    cancelAnimationFrame(this.frame)
    this.frame = 0
    if (!selection.overflow && selection.links.length) {
      void this.submit(selection.links)
    } else {
      this.overlay.dismiss()
    }
  }
  private readonly preventNativeDrag = (event: Event) => {
    if (this.gesture?.active || this.clickGesture?.moved) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }
  private readonly click = (event: MouseEvent) => {
    if (
      !event.isTrusted ||
      event.button !== 0 ||
      event.composedPath().includes(this.overlay.host)
    ) {
      return
    }
    const gesture = this.clickGesture
    this.clickGesture = undefined
    if (event.detail > 0 && Date.now() < this.suppressClickUntil) {
      event.preventDefault()
      event.stopImmediatePropagation()
      this.suppressClickUntil = 0
      return
    }
    if (
      !gesture?.released ||
      gesture.moved ||
      !this.canClick(event) ||
      eventAnchor(event) !== gesture.anchor
    ) {
      return
    }
    const link = readClickedCaptureLink(gesture.anchor)
    if (!link) {
      return
    }
    event.preventDefault()
    event.stopImmediatePropagation()
    this.enqueueClick(link)
  }
  private canClick(event: MouseEvent): boolean {
    return Boolean(
      this.settings?.clickEnabled &&
      this.clickKeyHeld &&
      !this.composing &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.shiftKey &&
      !event.metaKey &&
      !editableEvent(event),
    )
  }
  private moveClickGesture(event: PointerEvent) {
    const gesture = this.clickGesture
    if (!event.isTrusted || !gesture || gesture.pointerId !== event.pointerId) {
      return
    }
    if ((event.buttons & 1) === 0) {
      this.clickGesture = undefined
      return
    }
    gesture.moved ||=
      Math.hypot(
        event.clientX + window.scrollX - gesture.pageX,
        event.clientY + window.scrollY - gesture.pageY,
      ) >= DRAG_THRESHOLD
  }
  private releaseClickGesture(event: PointerEvent) {
    const gesture = this.clickGesture
    if (!event.isTrusted || !gesture || gesture.pointerId !== event.pointerId) {
      return
    }
    gesture.moved ||=
      Math.hypot(
        event.clientX + window.scrollX - gesture.pageX,
        event.clientY + window.scrollY - gesture.pageY,
      ) >= DRAG_THRESHOLD
    if (gesture.moved) {
      this.suppressClickUntil = Date.now() + CLICK_SUPPRESSION_MS
    }
    gesture.released =
      event.button === 0 &&
      this.canClick(event) &&
      eventAnchor(event) === gesture.anchor
  }
  private enqueueClick(link: CaptureLink) {
    if (
      this.pending?.links.some(({ url }) => url === link.url) ||
      this.queuedClicks.has(link.url)
    ) {
      return
    }
    if (this.queuedClicks.size >= MAX_QUEUED_CLICKS) {
      this.overlay.showNotice(this.messages.queueFull)
      return
    }
    this.queuedClicks.set(link.url, link)
    this.drainClicks()
  }
  private drainClicks() {
    if (this.pending || this.busy || this.disposed) {
      return
    }
    const next = this.queuedClicks.values().next().value
    if (next) {
      this.queuedClicks.delete(next.url)
      void this.submit([next], 'click')
    }
  }
  private readonly schedule = () => {
    if (!this.gesture?.active || this.frame) {
      return
    }
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.renderSelection()
      this.autoScroll()
    })
  }
  private renderSelection() {
    const gesture = this.gesture
    if (!gesture?.active) {
      return
    }
    if (this.candidatesDirty) {
      this.candidates = collectCaptureCandidates(document)
      this.candidatesDirty = false
    }
    const startX = gesture.pageX - window.scrollX
    const startY = gesture.pageY - window.scrollY
    const rectangle = {
      left: Math.min(startX, gesture.pointerX),
      right: Math.max(startX, gesture.pointerX),
      top: Math.min(startY, gesture.pointerY),
      bottom: Math.max(startY, gesture.pointerY),
    }
    this.lastSelection = selectCaptureLinks(this.candidates, rectangle)
    this.overlay.selection(rectangle, this.lastSelection, this.messages)
  }
  private autoScroll() {
    const gesture = this.gesture
    if (!gesture?.active) {
      return
    }
    const edgeDelta = (position: number, size: number) => {
      if (position < EDGE_DISTANCE) {
        return -EDGE_SCROLL_SPEED
      }
      if (position > size - EDGE_DISTANCE) {
        return EDGE_SCROLL_SPEED
      }
      return 0
    }
    const dx = edgeDelta(gesture.pointerX, window.innerWidth)
    const dy = edgeDelta(gesture.pointerY, window.innerHeight)
    if (dx || dy) {
      window.scrollBy(dx, dy)
      this.schedule()
    }
  }
  private async submit(
    links: CaptureLink[],
    mode: 'rectangle' | 'click' = 'rectangle',
  ) {
    this.pending = {
      requestId: createCaptureRequestId(),
      links,
      confirmed: false,
      mode,
    }
    await this.send(links.length > LARGE_BATCH_SIZE)
  }
  private async send(preview: boolean) {
    const batch = this.pending
    if (!batch || this.busy || this.disposed) {
      return
    }
    const textLength = batch.links.reduce(
      (size, link) => size + link.url.length + link.title.length,
      0,
    )
    if (textLength > LINK_CAPTURE_MAX_BATCH_TEXT_LENGTH) {
      this.overlay.showPanel(this.messages.selectionTooLarge, [
        { label: this.messages.cancel, run: this.cancel },
      ])
      return
    }
    this.busy = true
    this.overlay.showPanel(this.messages.saving, [])
    try {
      const response: LinkCaptureResponse | undefined =
        await browser.runtime.sendMessage({
          action: preview ? 'previewLinkCapture' : 'saveLinkCapture',
          mode: batch.mode,
          requestId: batch.requestId,
          links: batch.links,
          confirmed: batch.confirmed,
        })
      if (!this.isCurrent(batch)) {
        return
      }
      this.receive(response, preview)
    } catch {
      if (this.isCurrent(batch)) {
        this.failed(false)
      }
    } finally {
      this.busy = false
      this.drainClicks()
    }
  }
  private isCurrent(batch: PendingBatch): boolean {
    return this.pending === batch && !this.disposed
  }
  private receive(response: LinkCaptureResponse | undefined, preview: boolean) {
    if (!response) {
      this.failed(false)
      return
    }
    if (
      response.status === 'confirmation_required' ||
      (preview && response.status === 'ok')
    ) {
      this.confirm(response)
    } else if (response.status === 'ok') {
      this.pending = undefined
      this.overlay.showPanel(
        interpolate(this.messages.complete, {
          saved: response.saved,
          existing: response.existing,
          excluded: response.excluded,
          duplicates: response.duplicates,
          failed: response.failed,
        }),
        [
          {
            label: this.messages.dismiss,
            run: () => {
              this.overlay.dismiss()
            },
          },
        ],
      )
    } else {
      this.failed(response.status === 'forbidden')
    }
  }
  private confirm(response: LinkCaptureResponse) {
    this.overlay.showPanel(
      `${this.messages.confirmation}\n${interpolate(this.messages.preview, { new: response.newCount, existing: response.existing, excluded: response.excluded })}`,
      [
        {
          label: this.messages.save,
          run: () => {
            if (this.pending) {
              this.pending.confirmed = true
            }
            void this.send(false)
          },
        },
        { label: this.messages.cancel, run: this.cancel },
      ],
      this.pending?.links,
    )
  }
  private failed(forbidden: boolean) {
    this.overlay.showPanel(
      forbidden ? this.messages.forbidden : this.messages.error,
      [
        {
          label: this.messages.retry,
          run: () =>
            void this.send(
              Boolean(
                this.pending &&
                this.pending.links.length > LARGE_BATCH_SIZE &&
                !this.pending.confirmed,
              ),
            ),
        },
        { label: this.messages.cancel, run: this.cancel },
      ],
    )
  }
  private readonly clearRectangleGesture = () => {
    if (this.gesture?.active) {
      this.dragToSuppress = this.gesture.pointerId
      this.suppressClickUntil = Date.now() + CLICK_SUPPRESSION_MS
    }
    this.gesture = undefined
    cancelAnimationFrame(this.frame)
    this.frame = 0
    this.overlay.clearSelection()
  }
  private clearClickGesture() {
    if (this.clickGesture?.moved) {
      this.dragToSuppress = this.clickGesture.pointerId
    }
    this.clickGesture = undefined
  }
  private readonly cancelGesture = () => {
    this.keyHeld = false
    this.clickKeyHeld = false
    this.clearClickGesture()
    this.clearRectangleGesture()
  }
  private readonly cancel = () => {
    this.pending = undefined
    this.queuedClicks.clear()
    this.cancelGesture()
    this.overlay.dismiss()
  }
  readonly dispose = () => {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.cancel()
    this.events.abort()
    this.observer.disconnect()
    browser.storage.onChanged.removeListener(this.storageChanged)
    browser.runtime.onMessage.removeListener(this.message)
    this.overlay.remove()
    Reflect.deleteProperty(globalThis, STATE_KEY)
  }
}

export const startLinkCapture = async (): Promise<void> => {
  if (
    window.top !== window ||
    !['http:', 'https:'].includes(location.protocol)
  ) {
    return
  }
  const previous: unknown = Reflect.get(globalThis, STATE_KEY)
  if (
    previous &&
    typeof previous === 'object' &&
    'dispose' in previous &&
    typeof previous.dispose === 'function'
  ) {
    // A worker wake reinjects into open pages; keep any in-flight batch alive.
    return
  }
  const controller = new LinkCaptureController()
  Reflect.set(globalThis, STATE_KEY, controller)
  await controller.initialize()
}
