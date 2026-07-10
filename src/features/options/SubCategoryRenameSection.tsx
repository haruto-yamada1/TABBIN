import { Check, X } from 'lucide-react'
import { useCallback } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type SubCategoryRenameSectionProps = {
  renameInputRef: React.RefObject<HTMLInputElement | null>
  newCategoryName: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onCompleteRename: () => void | Promise<void>
  onCancelRename: () => void
  renameLabel: string
  renameHint: string
}

export const SubCategoryRenameSection = ({
  renameInputRef,
  newCategoryName,
  onChange,
  onKeyDown,
  onCompleteRename,
  onCancelRename,
  renameLabel,
  renameHint,
}: SubCategoryRenameSectionProps) => {
  const handleCompleteClick = useCallback(() => {
    void onCompleteRename()
  }, [onCompleteRename])

  return (
    <div className='relative mb-4'>
      <Label
        htmlFor='rename-category'
        className='mb-1 block text-sm text-foreground'
      >
        {renameLabel}
      </Label>
      <div className='flex'>
        <Input
          id='rename-category'
          ref={renameInputRef}
          type='text'
          value={newCategoryName}
          onChange={onChange}
          onKeyDown={onKeyDown}
          className='grow rounded-l border border-border bg-input p-2 text-foreground'
        />
        <div className='flex shrink-0'>
          <Button
            type='button'
            onClick={handleCompleteClick}
            variant='secondary'
            size='icon'
            className='rounded-none bg-secondary text-secondary-foreground hover:bg-secondary/80'
          >
            <Check size={16} />
          </Button>
          <Button
            type='button'
            onClick={onCancelRename}
            variant='ghost'
            size='icon'
            className='rounded-l-none'
          >
            <X size={16} />
          </Button>
        </div>
      </div>
      <div className='mt-1 text-xs text-muted-foreground'>{renameHint}</div>
    </div>
  )
}
