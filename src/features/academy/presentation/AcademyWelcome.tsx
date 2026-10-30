import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { academyWelcomeMessages } from './academyWelcomeMessages'
import { useAcademyWelcome } from './useAcademyWelcome'
import type { AcademyWelcomeCommands } from './useAcademyWelcome'

type Props = { useCases?: AcademyWelcomeCommands }

export const AcademyWelcome = ({ useCases }: Props) => {
  const { language } = useI18n()
  const copy = academyWelcomeMessages[language]
  const welcome = useAcademyWelcome(useCases)
  return (
    <>
      {welcome.error ? (
        <p
          role='alert'
          className='m-3 rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground'
        >
          {copy.saveError}
        </p>
      ) : null}
      <Dialog open={welcome.open} onOpenChange={welcome.handleOpenChange}>
        <DialogContent className='max-h-[90dvh] max-w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-xl motion-reduce:animate-none'>
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>
          <p className='text-sm text-muted-foreground'>{copy.safety}</p>
          <DialogFooter className='gap-2'>
            <Button
              type='button'
              variant='ghost'
              disabled={welcome.busy}
              onClick={welcome.handleSkip}
            >
              {copy.skip}
            </Button>
            <Button
              type='button'
              variant='outline'
              disabled={welcome.busy}
              onClick={welcome.handleLater}
            >
              {copy.later}
            </Button>
            <Button
              type='button'
              disabled={welcome.busy}
              onClick={welcome.handleStart}
            >
              {copy.start}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
