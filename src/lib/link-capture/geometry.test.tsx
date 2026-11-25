// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  collectCaptureCandidates,
  isCaptureEditable,
  selectCaptureLinks,
} from './geometry'

const rect = (left: number, top: number, width = 50, height = 20) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
  x: left,
  y: top,
  toJSON() {
    return {}
  },
})
const anchor = (href: string, text = '', rectangles = [rect(10, 10)]) => {
  const element = document.createElement('a')
  element.setAttribute('href', href)
  element.textContent = text
  Object.defineProperty(element, 'innerText', {
    get: () => element.textContent,
  })
  element.getClientRects = () => rectangles as unknown as DOMRectList
  document.body.append(element)
  return element
}

describe('capture page links', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })
  afterEach(() => {
    for (const base of document.querySelectorAll('base')) {
      base.remove()
    }
  })

  it('deduplicates exact URLs and intersects multiline link fragments separately', () => {
    anchor('https://example.com/path?q=1#part', 'First', [
      rect(10, 10),
      rect(10, 40),
    ])
    anchor('https://example.com/path?q=1#part', 'duplicate')
    anchor('https://example.com/path?q=2', 'second', [rect(200, 10)])
    const result = selectCaptureLinks(collectCaptureCandidates(document), {
      left: 0,
      top: 35,
      right: 100,
      bottom: 65,
    })
    expect(result.links).toEqual([
      { url: 'https://example.com/path?q=1#part', title: 'First' },
    ])
    expect(result.rectangles).toHaveLength(1)
  })

  it('resolves relative URLs using document URL, excludes fragment and unsafe schemes', () => {
    anchor('/relative', 'Relative')
    for (const href of [
      '#fragment',
      // eslint-disable-next-line no-script-url -- The forbidden scheme is a test input.
      'javascript:alert(1)',
      'mailto:a@example.com',
      'tel:123',
      'data:text/plain,a',
      '',
    ]) {
      anchor(href)
    }
    const candidates = collectCaptureCandidates(document)
    expect(candidates.map(({ link }) => link.url)).toEqual([
      new URL('/relative', document.URL).href,
    ])
  })

  it('preserves the browser destination for relative anchors when a base URL exists or changes', () => {
    const base = document.createElement('base')
    base.href = 'https://example.com/catalog/'
    document.head.append(base)
    const link = anchor('article?source=list#details', 'Article')
    expect(link.href).toBe(
      'https://example.com/catalog/article?source=list#details',
    )
    expect(
      collectCaptureCandidates(document).map(
        ({ link: candidate }) => candidate.url,
      ),
    ).toEqual([link.href])
    base.href = 'https://other.example.com/updated/'
    expect(
      collectCaptureCandidates(document).map(
        ({ link: candidate }) => candidate.url,
      ),
    ).toEqual([link.href])
    expect(link.href).toBe(
      'https://other.example.com/updated/article?source=list#details',
    )
  })

  it('ignores hidden, disabled, inert and transparent anchors and finds image fallback labels', () => {
    const visible = anchor('https://example.com/image')
    visible.setAttribute('aria-label', 'Image label')
    const hidden = anchor('https://example.com/hidden')
    hidden.hidden = true
    const disabled = anchor('https://example.com/disabled')
    disabled.setAttribute('aria-disabled', 'true')
    const transparent = anchor('https://example.com/transparent')
    transparent.style.opacity = '0'
    const inert = anchor('https://example.com/inert')
    inert.setAttribute('inert', '')
    const result = selectCaptureLinks(collectCaptureCandidates(document), {
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
    })
    expect(result.links).toEqual([
      { url: 'https://example.com/image', title: 'Image label' },
    ])
  })

  it('recognizes editor ancestors, ARIA textboxes and contenteditable', () => {
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    editor.innerHTML = '<span>Text</span>'
    document.body.append(editor)
    expect(isCaptureEditable(editor.firstChild)).toBe(true)
    expect(isCaptureEditable(document.createElement('input'))).toBe(true)
    const textbox = document.createElement('div')
    textbox.setAttribute('role', 'textbox')
    expect(isCaptureEditable(textbox)).toBe(true)
    expect(isCaptureEditable(document.createElement('a'))).toBe(false)
  })

  it('ignores link fragments clipped out of an overflow container', () => {
    const container = document.createElement('div')
    container.style.overflowX = 'hidden'
    container.style.overflowY = 'hidden'
    container.getBoundingClientRect = () => new DOMRect(0, 0, 10, 10)
    const link = anchor('https://example.com/clipped', 'clipped', [
      rect(20, 20),
    ])
    container.append(link)
    document.body.append(container)
    expect(
      selectCaptureLinks(collectCaptureCandidates(document), {
        left: 0,
        top: 0,
        right: 100,
        bottom: 100,
      }).links,
    ).toEqual([])
  })

  it.each(['absolute', 'fixed'])(
    'includes a %s link that escapes an intermediate overflow container',
    (position) => {
      const outer = document.createElement('div')
      outer.style.position = 'relative'
      if (position === 'fixed') {
        outer.style.transform = 'translate(0)'
      }
      const clip = document.createElement('div')
      clip.style.overflowX = 'hidden'
      clip.style.overflowY = 'hidden'
      clip.getBoundingClientRect = () => new DOMRect(0, 0, 10, 10)
      const link = anchor('https://example.com/escaped', 'escaped', [
        rect(20, 20),
      ])
      link.style.position = position
      clip.append(link)
      outer.append(clip)
      document.body.append(outer)
      expect(
        selectCaptureLinks(collectCaptureCandidates(document), {
          left: 0,
          top: 0,
          right: 100,
          bottom: 100,
        }).links,
      ).toEqual([{ url: link.href, title: 'escaped' }])
    },
  )

  it('includes an in-flow link inside an absolutely positioned wrapper that escapes clipping', () => {
    const outer = document.createElement('div')
    outer.style.position = 'relative'
    const clip = document.createElement('div')
    clip.style.overflowX = 'hidden'
    clip.style.overflowY = 'hidden'
    clip.getBoundingClientRect = () => new DOMRect(0, 0, 10, 10)
    const positioned = document.createElement('div')
    positioned.style.position = 'absolute'
    const link = anchor('https://example.com/wrapped', 'wrapped', [
      rect(20, 20),
    ])
    positioned.append(link)
    clip.append(positioned)
    outer.append(clip)
    document.body.append(outer)
    expect(
      selectCaptureLinks(collectCaptureCandidates(document), {
        left: 0,
        top: 0,
        right: 100,
        bottom: 100,
      }).links,
    ).toEqual([{ url: link.href, title: 'wrapped' }])
  })

  it.each([
    'transform: translate(0)',
    'translate: 0px',
    'rotate: 0deg',
    'scale: 1',
    'perspective: 100px',
    'filter: blur(0)',
    'backdrop-filter: blur(0)',
    'contain: layout',
    'contain: paint',
    'will-change: transform',
  ])('clips a fixed link at its containing block (%s)', (declaration) => {
    const clip = document.createElement('div')
    clip.style.cssText = declaration
    clip.style.overflowX = 'hidden'
    clip.style.overflowY = 'hidden'
    clip.getBoundingClientRect = () => new DOMRect(0, 0, 10, 10)
    const link = anchor('https://example.com/fixed', 'fixed', [rect(20, 20)])
    link.style.position = 'fixed'
    clip.append(link)
    document.body.append(clip)
    expect(
      selectCaptureLinks(collectCaptureCandidates(document), {
        left: 0,
        top: 0,
        right: 100,
        bottom: 100,
      }).links,
    ).toEqual([])
  })

  it('keeps clipping above a transformed containing block for a fixed link', () => {
    const clip = document.createElement('div')
    clip.style.overflowX = 'hidden'
    clip.style.overflowY = 'hidden'
    clip.getBoundingClientRect = () => new DOMRect(0, 0, 10, 10)
    const transformed = document.createElement('div')
    transformed.style.transform = 'translate(0)'
    const link = anchor('https://example.com/fixed', 'fixed', [rect(20, 20)])
    link.style.position = 'fixed'
    transformed.append(link)
    clip.append(transformed)
    document.body.append(clip)
    expect(
      selectCaptureLinks(collectCaptureCandidates(document), {
        left: 0,
        top: 0,
        right: 100,
        bottom: 100,
      }).links,
    ).toEqual([])
  })

  it('rejects more than 1,000 distinct selected URLs instead of truncating a batch silently', () => {
    for (let index = 0; index < 1001; index += 1) {
      anchor(`https://example.com/${index}`)
    }
    const result = selectCaptureLinks(collectCaptureCandidates(document), {
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
    })
    expect(result).toEqual({ links: [], rectangles: [], overflow: true })
  })
})
