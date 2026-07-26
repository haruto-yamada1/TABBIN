import { Moon, Sun } from 'lucide-react'
import { useCallback } from 'react'

import { useTheme } from '@/components/ThemeProvider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getMessage, resolveUiLanguage } from '@/features/i18n/lib/language'

const getThemeMessage = (key: string) =>
  getMessage(
    resolveUiLanguage(
      typeof navigator === 'undefined' ? undefined : navigator.language,
    ),
    key,
  )

export const ModeToggle = () => {
  const { setTheme } = useTheme()
  const handleLight = useCallback(() => {
    setTheme('light')
  }, [setTheme])
  const handleDark = useCallback(() => {
    setTheme('dark')
  }, [setTheme])
  const handleSystem = useCallback(() => {
    setTheme('system')
  }, [setTheme])
  const handleUser = useCallback(() => {
    setTheme('user')
  }, [setTheme])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className='relative' variant='outline' size='icon'>
          <Sun className='size-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90' />
          <Moon className='absolute size-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0' />
          <span className='sr-only'>{getThemeMessage('theme.toggle')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuItem onClick={handleLight}>
          {getThemeMessage('theme.light')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDark}>
          {getThemeMessage('theme.dark')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleSystem}>
          {getThemeMessage('theme.system')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleUser}>
          {getThemeMessage('theme.user')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
