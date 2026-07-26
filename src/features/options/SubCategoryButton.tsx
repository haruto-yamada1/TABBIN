import { X } from 'lucide-react'
import { useCallback } from 'react'

import { Button } from '@/components/ui/button'

type SubCategoryButtonProps = {
  category: string
  activeCategory: string | null
  onSelect: (category: string) => void
  onRemove: (category: string) => void | Promise<void>
  deleteAriaLabel: string
}

export const SubCategoryButton = ({
  category,
  activeCategory,
  onSelect,
  onRemove,
  deleteAriaLabel,
}: SubCategoryButtonProps) => {
  const handleSelect = useCallback(() => {
    onSelect(category)
  }, [onSelect, category])

  const handleRemove = useCallback(() => {
    void onRemove(category)
  }, [onRemove, category])

  return (
    <div className='flex max-w-full items-center'>
      <Button
        type='button'
        onClick={handleSelect}
        variant={activeCategory === category ? 'secondary' : 'outline'}
        size='sm'
        className={`max-w-[180px] cursor-pointer truncate rounded-r-none ${
          activeCategory === category
            ? 'bg-secondary text-secondary-foreground'
            : 'bg-muted text-foreground hover:bg-secondary/80'
        }`}
      >
        {category}
      </Button>
      <Button
        type='button'
        onClick={handleRemove}
        variant='outline'
        size='sm'
        className='shrink-0 cursor-pointer rounded-l-none'
        aria-label={deleteAriaLabel}
      >
        <X size={14} />
      </Button>
    </div>
  )
}
