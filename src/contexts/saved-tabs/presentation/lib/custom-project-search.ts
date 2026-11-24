import Fuse from 'fuse.js'

import type { ProjectUrlEntry } from '@/contexts/saved-tabs/application/use-cases/GetProjectUrlsUseCase'
import type { SavedTabsCustomProjectDto as CustomProject } from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

const projectFuseOptions = {
  keys: ['name'],
  threshold: 0.4,
}

const projectUrlFuseOptions = {
  keys: ['title', 'url'],
  threshold: 0.4,
}

const mapMatchedUrlsToProject = (
  project: CustomProject,
  matchedUrls: ProjectUrlEntry[],
): CustomProject => {
  const matchedUrlIds = new Set(matchedUrls.map((url) => url.id))

  return {
    ...project,
    ...(project.memberships !== undefined
      ? {
          memberships: project.memberships.filter(({ urlId }) =>
            matchedUrlIds.has(urlId),
          ),
        }
      : {}),
    urls: matchedUrls.map((url) => ({
      ...(url.category !== undefined ? { category: url.category } : {}),
      ...(url.isFavorite !== undefined ? { isFavorite: url.isFavorite } : {}),
      id: url.id,
      ...(url.notes !== undefined ? { notes: url.notes } : {}),
      savedAt: url.savedAt,
      title: url.title,
      url: url.url,
    })),
  }
}

export const createCustomProjectSearch = (
  customProjects: CustomProject[],
  loadProjectUrls: (
    projects: CustomProject[],
  ) => Promise<ReadonlyMap<string, ProjectUrlEntry[]>>,
) => {
  let projectIndex: Fuse<CustomProject> | undefined
  let projectUrls: ReturnType<typeof loadProjectUrls> | undefined
  const urlIndexes = new Map<string, Fuse<ProjectUrlEntry>>()

  return async (
    searchQuery: string,
    signal?: AbortSignal,
  ): Promise<CustomProject[]> => {
    const query = searchQuery.trim()
    if (!query) {
      return customProjects
    }

    projectIndex ??= new Fuse(customProjects, projectFuseOptions)
    const nameMatches = projectIndex.search(query).map(({ item }) => item)
    const matchedByName = new Set(nameMatches)
    const projectsToSearch = customProjects.filter(
      (project) => !matchedByName.has(project),
    )
    if (projectsToSearch.length === 0) {
      return nameMatches
    }

    projectUrls ??= loadProjectUrls(customProjects).catch((error: unknown) => {
      projectUrls = undefined
      throw error
    })
    const urlsByProject = await projectUrls
    if (signal?.aborted) {
      return []
    }

    const matches = new Map(nameMatches.map((project) => [project.id, project]))
    for (const project of projectsToSearch) {
      const urls = urlsByProject.get(project.id)
      if (!urls?.length) {
        continue
      }
      let index = urlIndexes.get(project.id)
      if (!index) {
        index = new Fuse(urls, projectUrlFuseOptions)
        urlIndexes.set(project.id, index)
      }

      const urlsById = new Map<string, ProjectUrlEntry>()
      for (const { item } of index.search(query)) {
        if (!urlsById.has(item.id)) {
          urlsById.set(item.id, item)
        }
      }
      if (urlsById.size > 0) {
        matches.set(
          project.id,
          mapMatchedUrlsToProject(project, [...urlsById.values()]),
        )
      }
    }
    return [...matches.values()]
  }
}
