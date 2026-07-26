import type { z } from 'zod'

import type {
  UserSettingsSchema,
  aiSystemPromptPresetSchema,
} from '@/lib/storage/zod-storage'

// URLレコードのインターフェース（共通URL管理用）
export type UrlRecord = {
  id: string
  url: string
  title: string
  savedAt: number
  favIconUrl?: string
}

// 親カテゴリのインターフェース
export type ParentCategory = {
  id: string
  name: string
  domains: string[] // このカテゴリに属するドメインIDのリスト
  domainNames: string[] // このカテゴリに属するドメイン名のリスト (新規追加)
}

// 子カテゴリのキーワード設定のインターフェース
export type SubCategoryKeyword = {
  categoryName: string // カテゴリ名
  keywords: string[] // 関連キーワードリスト
}

export type ProjectKeywordSettings = {
  titleKeywords: string[]
  urlKeywords: string[]
  domainKeywords: string[]
}

export type TabGroup = {
  id: string
  domain: string
  parentCategoryId?: string // 親カテゴリのID
  // 新形式: URLのIDを参照
  urlIds?: string[]
  // 旧形式: 既存データとの互換性のため残す（マイグレーション用）
  urls?: {
    id?: string
    url: string
    title: string
    subCategory?: string // 子カテゴリ名
    savedAt?: number // 個別のURL保存時刻を追加
  }[]
  // URLのサブカテゴリ情報
  urlSubCategories?: Record<string, string> // URLのID -> サブカテゴリ名のマッピング
  subCategories?: string[] // このドメインで利用可能な子カテゴリのリスト
  categoryKeywords?: SubCategoryKeyword[] // 子カテゴリのキーワード設定
  subCategoryOrder?: string[] // 子カテゴリの表示順序
  subCategoryOrderWithUncategorized?: string[] // 未分類カテゴリを含む全カテゴリの表示順序
  savedAt?: number // グループ全体の保存時刻を追加
}

/**
 * `UserSettings` の runtime schema から導出する型 (issue #672)。
 *
 * `z.infer<typeof UserSettingsSchema>` と構造一致するため、schema と
 * TypeScript interface の二重管理を回避できる。
 */
export type UserSettings = z.infer<typeof UserSettingsSchema>

// ドメイン別のカテゴリ設定を保存するためのインターフェース
export type DomainCategorySettings = {
  domain: string // ドメイン
  subCategories: string[] // このドメインで設定された子カテゴリリスト
  categoryKeywords: SubCategoryKeyword[] // カテゴリキーワード設定
}

// ドメインと親カテゴリのマッピングを保存するインターフェース
export type DomainParentCategoryMapping = {
  domain: string // ドメイン（URL）
  categoryId: string // 親カテゴリID
}

// カスタムプロジェクト（PJ単位）のデータ構造
export type CustomProject = {
  id: string
  name: string
  projectKeywords?: ProjectKeywordSettings
  // 新形式: URLのIDを参照
  urlIds?: string[]
  // 旧形式: 既存データとの互換性のため残す（マイグレーション用）
  urls?: {
    url: string
    title: string
    notes?: string
    savedAt?: number // 個別のURL保存時刻
    category?: string // プロジェクト内でのカテゴリ分類
  }[]
  // URLのメタデータ
  urlMetadata?: Record<
    string,
    {
      notes?: string
      category?: string
    }
  > // URLのID -> メタデータのマッピング
  categories: string[] // このプロジェクトで利用可能なカテゴリリスト
  categoryOrder?: string[] // カテゴリの表示順序
  createdAt: number
  updatedAt: number
}

/**
 * AI system prompt preset の runtime schema から導出する型 (issue #672)。
 */
export type AiSystemPromptPreset = z.infer<typeof aiSystemPromptPresetSchema>

// ビューモード（表示モード）の型定義
export type ViewMode = 'domain' | 'custom'
