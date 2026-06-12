import { createContext, use } from 'react'

/**
 * 複合コンポーネント用のコンテキストファクトリ関数
 * Context、Provider、useCompoundContext フックを一括生成する
 * @param componentName コンポーネント名（エラーメッセージ用）
 * @returns Context と useCompoundContext フック
 */
export const createCompoundContext = <T>(
  componentName: string,
): {
  /** コンテキストオブジェクト（Provider として使用） */
  context: React.Context<T | null>
  /** コンテキストにアクセスするためのフック */
  useCompoundContext: () => T
} => {
  const context = createContext<T | null>(null)

  /** コンテキストにアクセスするためのフック */
  const useCompoundContext = (): T => {
    const currentContext = use(context)
    if (!currentContext) {
      throw new Error(`${componentName}のProvider内で使用してください`)
    }
    return currentContext
  }
  return {
    context,
    useCompoundContext,
  }
}
