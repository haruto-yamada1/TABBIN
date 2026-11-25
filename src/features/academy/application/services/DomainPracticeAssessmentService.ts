import type {
  PracticeBrowserAction,
  PracticeSnapshotDto,
} from '@/features/academy/application/dto/PracticeSessionDto'

type Ranked = { readonly id: string; readonly sortOrder: number }

const sameStrings = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index])

const changedOrder = <Item extends Ranked>(
  before: readonly Item[],
  after: readonly Item[],
): boolean => {
  if (
    before.length < 2 ||
    before.length !== after.length ||
    before.some((item) => !after.some((next) => next.id === item.id))
  ) {
    return false
  }
  const ordered = (items: readonly Item[]) =>
    items
      .toSorted(
        (left, right) =>
          left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
      )
      .map((item) => item.id)
  return !sameStrings(ordered(before), ordered(after))
}

const domainCollections = (snapshot: PracticeSnapshotDto) =>
  snapshot.collections.filter((item) => item.definition.type === 'domain')

const domainCategories = (snapshot: PracticeSnapshotDto) => {
  const collectionIds = new Set(domainCollections(snapshot).map(({ id }) => id))
  return snapshot.categories.filter((item) =>
    collectionIds.has(item.collectionId),
  )
}

const replacedByRename = (
  before: PracticeSnapshotDto,
  after: PracticeSnapshotDto,
) => {
  const pairs = new Map<string, string>()
  for (const collection of domainCollections(before)) {
    const previous = domainCategories(before).filter(
      (category) => category.collectionId === collection.id,
    )
    const next = domainCategories(after).filter(
      (category) => category.collectionId === collection.id,
    )
    if (previous.length !== next.length) {
      continue
    }
    const removed = previous.filter(
      (category) => !next.some(({ id }) => id === category.id),
    )
    const added = next.filter(
      (category) => !previous.some(({ id }) => id === category.id),
    )
    const source = removed[0]
    const target = added[0]
    if (
      removed.length !== 1 ||
      added.length !== 1 ||
      !source ||
      !target?.name.trim() ||
      source.name === target.name ||
      source.sortOrder !== target.sortOrder ||
      !sameStrings(source.keywords, target.keywords)
    ) {
      continue
    }
    const memberIds = (snapshot: PracticeSnapshotDto, categoryId: string) =>
      snapshot.memberships
        .filter(
          (membership) =>
            membership.collectionId === collection.id &&
            membership.categoryId === categoryId,
        )
        .map(({ urlId }) => urlId)
        .toSorted()
    if (
      sameStrings(memberIds(before, source.id), memberIds(after, target.id))
    ) {
      pairs.set(source.id, target.id)
    }
  }
  return pairs
}

const movedDomain = (
  before: PracticeSnapshotDto,
  after: PracticeSnapshotDto,
  requirePreviousParent: boolean,
) =>
  domainCollections(after).some((collection) => {
    const previous = domainCollections(before).find(
      ({ id }) => id === collection.id,
    )
    return (
      previous !== undefined &&
      (!requirePreviousParent || previous.groupId !== undefined) &&
      collection.groupId !== previous.groupId &&
      after.groups.some(({ id }) => id === collection.groupId)
    )
  })

const regroupedUrl = (
  before: PracticeSnapshotDto,
  after: PracticeSnapshotDto,
) => {
  const categories = domainCategories(after)
  const renames = replacedByRename(before, after)
  return after.memberships.some((membership) => {
    if (
      !categories.some(
        (category) =>
          category.id === membership.categoryId &&
          category.collectionId === membership.collectionId,
      )
    ) {
      return false
    }
    const previous = before.memberships.find(
      (item) =>
        item.collectionId === membership.collectionId &&
        item.urlId === membership.urlId,
    )
    return (
      previous !== undefined &&
      previous.categoryId !== membership.categoryId &&
      (!previous.categoryId ||
        renames.get(previous.categoryId) !== membership.categoryId) &&
      before.urls.some(({ id }) => id === membership.urlId) &&
      after.urls.some(({ id }) => id === membership.urlId)
    )
  })
}

const restoredDomainUrl = (
  before: PracticeSnapshotDto,
  beforeActions: readonly PracticeBrowserAction[],
  afterActions: readonly PracticeBrowserAction[],
) => {
  if (
    afterActions.length <= beforeActions.length ||
    beforeActions.some((action, index) => {
      const next = afterActions[index]
      return (
        !next ||
        action.type !== next.type ||
        !sameStrings(action.urls, next.urls)
      )
    })
  ) {
    return false
  }
  const domains = new Set(domainCollections(before).map(({ id }) => id))
  const memberIds = new Set(
    before.memberships
      .filter((item) => domains.has(item.collectionId))
      .map((item) => item.urlId),
  )
  const urls = new Set(
    before.urls.filter(({ id }) => memberIds.has(id)).map(({ url }) => url),
  )
  return afterActions
    .slice(beforeActions.length)
    .some(
      (action) =>
        action.urls.length > 0 && action.urls.every((url) => urls.has(url)),
    )
}

/** Called only for a successful, committed operation in the isolated session. */
export type DomainPracticeChange = {
  readonly stepId: string
  readonly before: PracticeSnapshotDto
  readonly after: PracticeSnapshotDto
  readonly beforeActions: readonly PracticeBrowserAction[]
  readonly afterActions: readonly PracticeBrowserAction[]
}

export const isDomainPracticeStepComplete = ({
  stepId,
  before,
  after,
  beforeActions,
  afterActions,
}: DomainPracticeChange): boolean => {
  switch (stepId) {
    case 'parent-categories-create': {
      return after.groups.some(
        (group) =>
          group.name.trim() !== '' &&
          !before.groups.some(({ id }) => id === group.id),
      )
    }
    case 'parent-categories-rename': {
      return after.groups.some(
        (group) =>
          group.name.trim() !== '' &&
          before.groups.some(
            (previous) =>
              previous.id === group.id && previous.name !== group.name,
          ),
      )
    }
    case 'parent-categories-assign': {
      return movedDomain(before, after, false)
    }
    case 'parent-categories-success': {
      return movedDomain(before, after, true)
    }
    case 'child-categories-create': {
      return domainCategories(after).some(
        (category) =>
          category.name.trim() !== '' &&
          domainCollections(before).some(
            ({ id }) => id === category.collectionId,
          ) &&
          !before.categories.some(({ id }) => id === category.id) &&
          after.categories.filter(
            (item) => item.collectionId === category.collectionId,
          ).length >
            before.categories.filter(
              (item) => item.collectionId === category.collectionId,
            ).length,
      )
    }
    case 'child-categories-rename': {
      return (
        replacedByRename(before, after).size > 0 ||
        domainCategories(after).some(
          (category) =>
            category.name.trim() !== '' &&
            domainCategories(before).some(
              (previous) =>
                previous.id === category.id && previous.name !== category.name,
            ),
        )
      )
    }
    case 'child-categories-keywords': {
      return domainCategories(after).some((category) =>
        domainCategories(before).some(
          (previous) =>
            previous.id === category.id &&
            !sameStrings(previous.keywords, category.keywords),
        ),
      )
    }
    case 'child-categories-success': {
      return regroupedUrl(before, after)
    }
    case 'reorder-items-parents': {
      return changedOrder(before.groups, after.groups)
    }
    case 'reorder-items-domains': {
      return domainCollections(before).some((collection) =>
        changedOrder(
          domainCollections(before).filter(
            (item) => item.groupId === collection.groupId,
          ),
          domainCollections(after).filter(
            (item) => item.groupId === collection.groupId,
          ),
        ),
      )
    }
    case 'reorder-items-success': {
      return domainCollections(before).some((collection) =>
        changedOrder(
          domainCategories(before).filter(
            (item) => item.collectionId === collection.id,
          ),
          domainCategories(after).filter(
            (item) => item.collectionId === collection.id,
          ),
        ),
      )
    }
    case 'restore-tabs-success': {
      return restoredDomainUrl(before, beforeActions, afterActions)
    }
    default: {
      return false
    }
  }
}
