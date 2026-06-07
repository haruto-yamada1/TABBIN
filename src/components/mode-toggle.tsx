import { Moon, Sun } from 'lucide-react'

import { useTheme } from '@/components/theme-provider'
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
        <DropdownMenuItem
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
          onClick={() => {
            setTheme('light')
          }}
        >
          {getThemeMessage('theme.light')}
        </DropdownMenuItem>
        <DropdownMenuItem
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
          onClick={() => {
            setTheme('dark')
          }}
        >
          {getThemeMessage('theme.dark')}
        </DropdownMenuItem>
        <DropdownMenuItem
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
          onClick={() => {
            setTheme('system')
          }}
        >
          {getThemeMessage('theme.system')}
        </DropdownMenuItem>
        <DropdownMenuItem
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
          onClick={() => {
            setTheme('user')
          }}
        >
          {getThemeMessage('theme.user')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
