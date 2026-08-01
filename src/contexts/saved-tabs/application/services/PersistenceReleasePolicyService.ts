/**
 * Persistence v2 の runtime と配布 artifact が共有する release invariant。
 * DB schema を変更するときは release metadata と同じ変更単位で更新する。
 */
export const PERSISTENCE_DATABASE_VERSION = 1
export const PERSISTENCE_GENERATION = 2
