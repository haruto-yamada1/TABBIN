import { useDomainCard } from './DomainCardContext'

/**
 * DomainCard の sticky ヘッダーラッパー
 * 親カテゴリの有無に応じて sticky 位置を動的に設定する
 * @param props children
 */
export const DomainCardHeader = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const { categoryId } = useDomainCard()

  // 親カテゴリの有無に応じてsticky位置を動的に設定
  const stickyTop = categoryId ? 'top-8' : 'top-6'

  return (
    <div className={`sticky ${stickyTop} z-40 w-full bg-card py-2`}>
      <div className='flex w-full items-center justify-between gap-2'>
        {children}
      </div>
    </div>
  )
}
