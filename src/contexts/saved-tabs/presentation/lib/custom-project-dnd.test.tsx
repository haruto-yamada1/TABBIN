import type {
  Active,
  CollisionDetection,
  KeyboardCoordinateGetter,
} from '@dnd-kit/core'
import { describe, expect, it } from 'vitest'

import {
  customProjectCollisionDetection,
  customProjectKeyboardCoordinates,
} from './custom-project-dnd'

type Container =
  Parameters<CollisionDetection>[0]['droppableContainers'][number]
type ContainerMap =
  Parameters<KeyboardCoordinateGetter>[1]['context']['droppableContainers']
const rect = (top: number, height = 20) => ({
  top,
  left: 0,
  width: 200,
  height,
  bottom: top + height,
  right: 200,
})
const item = (
  id: string,
  top: number,
  data: Record<string, unknown>,
  height = 20,
): Container => ({
  id,
  key: id,
  data: { current: data },
  disabled: false,
  node: { current: document.createElement('div') },
  rect: { current: rect(top, height) },
})
const active = (data: Record<string, unknown>): Active => ({
  id: 'active',
  data: { current: data },
  rect: { current: { initial: null, translated: null } },
})
const containers = (values: Container[]): ContainerMap =>
  Object.assign(new Map(values.map((entry) => [entry.id, entry])), {
    toArray: () => values,
    getEnabled: () => values.filter((entry) => !entry.disabled),
    getNodeFor: (id: string | number) =>
      values.find((entry) => entry.id === id)?.node.current ?? undefined,
  })
const keyboardArgs = (
  current: Active,
  targets: Container[],
): Parameters<KeyboardCoordinateGetter>[1] => ({
  active: current.id,
  currentCoordinates: { x: 0, y: 0 },
  context: {
    activatorEvent: new KeyboardEvent('keydown'),
    active: current,
    activeNode: null,
    collisionRect: rect(0),
    collisions: null,
    draggableNodes: new Map(),
    draggingNode: null,
    draggingNodeRect: null,
    droppableRects: new Map(
      targets.flatMap((target) =>
        target.rect.current ? [[target.id, target.rect.current] as const] : [],
      ),
    ),
    droppableContainers: containers(targets),
    over: null,
    scrollableAncestors: [],
    scrollAdjustedTranslate: null,
  },
})

describe('Custom drag keyboard targets', () => {
  it('keeps project reorder targets separate from nested cards and URLs', () => {
    const current = active({ type: 'project', projectId: 'active' })
    const targets = [
      item('active', 0, { type: 'project', projectId: 'active' }),
      item('nested', 21, { type: 'url', projectId: 'active' }),
      item('project-other', 22, { type: 'project', projectId: 'other' }),
      item('other', 40, { type: 'project', projectId: 'other' }),
    ]
    expect(
      customProjectKeyboardCoordinates(
        new KeyboardEvent('keydown', { code: 'ArrowDown' }),
        keyboardArgs(current, targets),
      ),
    ).toEqual({ x: 0, y: 40 })
  })

  it('preserves pointer URL reordering and category moves inside overlapping cards', () => {
    const current = active({ type: 'url', projectId: 'one' })
    const targets = [
      item(
        'category',
        0,
        { type: 'category', projectId: 'one', categoryName: 'Work' },
        200,
      ),
      item('url', 40, { type: 'url', projectId: 'one', category: 'Work' }),
    ]
    const args = {
      active: current,
      collisionRect: rect(40),
      droppableRects: keyboardArgs(current, targets).context.droppableRects,
      droppableContainers: targets,
      pointerCoordinates: { x: 10, y: 45 },
    }
    expect(customProjectCollisionDetection(args)[0]?.id).toBe('url')
    expect(
      customProjectCollisionDetection({
        ...args,
        pointerCoordinates: { x: 10, y: 10 },
      })[0]?.id,
    ).toBe('category')
  })

  it('ignores an unavailable drag and nonmovement keys', () => {
    const current = active({ type: 'url', projectId: 'one' })
    const args = keyboardArgs(current, [])
    const key = new KeyboardEvent('keydown', { code: 'ArrowUp' })
    expect(
      customProjectKeyboardCoordinates(key, {
        ...args,
        context: { ...args.context, active: null },
      }),
    ).toBeUndefined()
    expect(
      customProjectKeyboardCoordinates(key, {
        ...args,
        context: { ...args.context, collisionRect: null },
      }),
    ).toBeUndefined()
    expect(
      customProjectKeyboardCoordinates(
        new KeyboardEvent('keydown', { code: 'KeyA' }),
        args,
      ),
    ).toBeUndefined()
    const unknown = active({})
    expect(
      customProjectKeyboardCoordinates(
        key,
        keyboardArgs(unknown, [item('invalid', 40, {})]),
      ),
    ).toBeUndefined()
  })

  it('reorders categories only against category sortables in the source project', () => {
    const current = active({
      type: 'category',
      projectId: 'one',
      categoryName: 'First',
    })
    const targets = [
      item('active', 0, {
        type: 'category',
        projectId: 'one',
        categoryName: 'First',
      }),
      item('parent', 21, { type: 'project', projectId: 'one' }),
      item('other-project', 24, {
        type: 'category',
        projectId: 'two',
        categoryName: 'Second',
      }),
      item('drop-area', 27, {
        type: 'category',
        projectId: 'one',
        isDropArea: true,
      }),
      item('second', 40, {
        type: 'category',
        projectId: 'one',
        categoryName: 'Second',
      }),
    ]
    const args = keyboardArgs(current, targets)
    expect(
      customProjectKeyboardCoordinates(
        new KeyboardEvent('keydown', { code: 'ArrowDown' }),
        args,
      ),
    ).toEqual({ x: 0, y: 40 })
    const collisions = customProjectCollisionDetection({
      active: current,
      collisionRect: rect(40),
      droppableRects: args.context.droppableRects,
      droppableContainers: targets,
      pointerCoordinates: null,
    })
    expect(collisions[0]?.id).toBe('second')
    expect(collisions.map((collision) => collision.id)).not.toContain(
      'other-project',
    )
  })

  it('prioritizes URL order inside the bucket before moving to another category', () => {
    const current = active({ type: 'url', projectId: 'one', category: 'First' })
    const targets = [
      item('active', 0, { type: 'url', projectId: 'one', category: 'First' }),
      item('second-category', 22, {
        type: 'category',
        projectId: 'one',
        categoryName: 'Second',
      }),
      item('next-url', 40, {
        type: 'url',
        projectId: 'one',
        category: 'First',
      }),
    ]
    expect(
      customProjectKeyboardCoordinates(
        new KeyboardEvent('keydown', { code: 'ArrowDown' }),
        keyboardArgs(current, targets),
      ),
    ).toEqual({ x: 0, y: 40 })
  })

  it('reaches an empty category, uncategorized area, and another project at a bucket boundary', () => {
    const current = active({ type: 'url', projectId: 'one', category: 'First' })
    for (const data of [
      { type: 'category', projectId: 'one', categoryName: 'Empty' },
      { type: 'uncategorized', projectId: 'one' },
      { type: 'project-header', projectId: 'two' },
    ]) {
      const targets = [
        item('active', 0, { type: 'url', projectId: 'one', category: 'First' }),
        item('parent', 21, { type: 'project', projectId: 'one' }),
        item('destination', 40, data),
      ]
      expect(
        customProjectKeyboardCoordinates(
          new KeyboardEvent('keydown', { code: 'ArrowDown' }),
          keyboardArgs(current, targets),
        ),
      ).toEqual({ x: 0, y: 40 })
    }
  })
})
