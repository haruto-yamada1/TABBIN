import { X } from 'lucide-react'
import { useCallback } from 'react'

import { Button } from '@/components/ui/button'

type SubCategoryKeywordTagProps = {
  keyword: string
  onRemove: (keyword: string) => void | Promise<void>
  deleteAriaLabel: string
}

export const SubCategoryKeywordTag = ({
  keyword,
  onRemove,
  deleteAriaLabel,
}: SubCategoryKeywordTagProps) => {
  const handleRemove = useCallback(() => {
    void onRemove(keyword)
  }, [onRemove, keyword])

  return (
    <div
      className='flex max-w-full items-center rounded bg-muted px-2 py-1 text-sm text-foreground'
      title={keyword}
    >
      <span className='max-w-[150px] truncate'>{keyword}</span>
      <Button
        type='button'
        onClick={handleRemove}
        variant='ghost'
        size='sm'
        className='ml-1 shrink-0 cursor-pointer p-0 text-muted-foreground hover:bg-transparent hover:text-foreground'
        aria-label={deleteAriaLabel}
      >
        <X size={14} />
      </Button>
    </div>
  )
}
