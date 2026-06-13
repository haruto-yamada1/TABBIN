import { CardHeader } from '@/components/ui/card'

/**
 * CategoryGroup の sticky ヘッダーラッパー
 * @param props children
 */
export const CategoryGroupHeader = ({
  children,
}: {
  children: React.ReactNode
}) => (
  <CardHeader className='sticky top-0 z-50 flex-row items-baseline justify-between bg-card'>
    {children}
  </CardHeader>
)
