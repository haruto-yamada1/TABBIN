// URLレコードのインターフェース（共通URL管理用）
export interface UrlRecord {
  id: string
  url: string
  title: string
  savedAt: number
  favIconUrl?: string
}

// 親カテゴリのインターフェース
export interface ParentCategory {
  id: string
  name: string
  domains: string[] // このカテゴリに属するドメインIDのリスト
  domainNames: string[] // このカテゴリに属するドメイン名のリスト (新規追加)
}

// 子カテゴリのキーワード設定のインターフェース
export interface SubCategoryKeyword {
  categoryName: string // カテゴリ名
  keywords: string[] // 関連キーワードリスト
}

export interface ProjectKeywordSettings {
  titleKeywords: string[]
  urlKeywords: string[]
  domainKeywords: string[]
}

export interface TabGroup {
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

export interface UserSettings {
  language?: 'system' | 'ja' | 'en'
  removeTabAfterOpen: boolean
  removeTabAfterExternalDrop: boolean
  excludePatterns: string[]
  enableCategories: boolean // カテゴリ機能の有効/無効
  autoDeletePeriod?: string // Never, 1hour, 1day, 7days, 14days, 30days, 180days, 365days
  showSavedTime: boolean // 保存日時を表示するかどうか
  clickBehavior:
    | 'saveCurrentTab'
    | 'saveWindowTabs'
    | 'saveSameDomainTabs'
    | 'saveAllWindowsTabs' // 新しいオプション: クリック時の挙動
  excludePinnedTabs: boolean // 固定タブ（ピン留め）を除外するかどうか
  openUrlInBackground: boolean // URLクリック時に別タブで開くかどうか
  openAllInNewWindow: boolean // 「すべてのタブを開く」を別ウィンドウで開くかどうか
  confirmDeleteAll: boolean // すべて削除前に確認するかどうか
  confirmDeleteEach: boolean // URL削除前に個別確認するかどうか
  fontSizePercent?: number
  colors?: Record<string, string> // ユーザー設定: カラー設定まとめ
  ollamaModel?: string
  aiSystemPrompts?: AiSystemPromptPreset[]
  activeAiSystemPromptId?: string
}

// ドメイン別のカテゴリ設定を保存するためのインターフェース
export interface DomainCategorySettings {
  domain: string // ドメイン
  subCategories: string[] // このドメインで設定された子カテゴリリスト
  categoryKeywords: SubCategoryKeyword[] // カテゴリキーワード設定
}

// ドメインと親カテゴリのマッピングを保存するインターフェース
export interface DomainParentCategoryMapping {
  domain: string // ドメイン（URL）
  categoryId: string // 親カテゴリID
}

// カスタムプロジェクト（PJ単位）のデータ構造
export interface CustomProject {
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

export interface AiSystemPromptPreset {
  id: string
  name: string
  template: string
  createdAt: number
  updatedAt: number
}

// ビューモード（表示モード）の型定義
export type ViewMode = 'domain' | 'custom'
