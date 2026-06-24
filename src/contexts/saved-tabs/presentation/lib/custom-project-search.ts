import Fuse from 'fuse.js'

import type { SavedTabsCustomProjectDto as CustomProject } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type {
  GetProjectUrlsUseCase,
  ProjectUrlEntry,
} from '@/contexts/saved-tabs/application/use-cases/GetProjectUrlsUseCase'

type ProjectUrlItem = ProjectUrlEntry

interface FilterCustomProjectsByQueryParams {
  customProjects: CustomProject[]
  searchQuery: string
  loadProjectUrls: GetProjectUrlsUseCase
}

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
  const matchedUrlIds = matchedUrls.map((url) => url.id)

  return {
    ...project,
    urlIds: matchedUrlIds,
    urlMetadata: project.urlMetadata
      ? Object.fromEntries(
          Object.entries(project.urlMetadata).filter(([id]) =>
            matchedUrlIds.includes(id),
          ),
        )
      : project.urlMetadata,
    urls: matchedUrls.map((url) => ({
      url: url.url,
      title: url.title,
      notes: url.notes,
      savedAt: url.savedAt,
      category: url.category,
    })),
  }
}

export const filterCustomProjectsByQuery = async ({
  customProjects,
  searchQuery,
  loadProjectUrls,
}: FilterCustomProjectsByQueryParams): Promise<CustomProject[]> => {
  const normalizedQuery = searchQuery.trim()
  if (!normalizedQuery) {
    return customProjects
  }

  const matchedProjects = new Fuse(customProjects, projectFuseOptions)
    .search(normalizedQuery)
    .map((result) => result.item)
  const matchedProjectSet = new Set(matchedProjects)

  const urlMatchedProjects = await Promise.all(
    customProjects.flatMap((project) =>
      matchedProjectSet.has(project)
        ? []
        : [
            (async () => {
              const projectUrls = await loadProjectUrls(project)
              const searchableUrls = Array.isArray(projectUrls)
                ? projectUrls
                : []
              const seenUrls = new Set<string>()
              const matchedUrls = new Fuse(
                searchableUrls,
                projectUrlFuseOptions,
              )
                .search(normalizedQuery)
                .reduce<ProjectUrlItem[]>((items, result) => {
                  if (!seenUrls.has(result.item.url)) {
                    seenUrls.add(result.item.url)
                    items.push(result.item)
                  }
                  return items
                }, [])

              if (matchedUrls.length === 0) {
                return null
              }

              return mapMatchedUrlsToProject(project, matchedUrls)
            })(),
          ],
    ),
  )

  const uniqueProjects = new Map<string, CustomProject>()
  for (const project of [...matchedProjects, ...urlMatchedProjects]) {
    if (!project) {
      continue
    }
    uniqueProjects.set(project.id, project)
  }

  return [...uniqueProjects.values()]
}
