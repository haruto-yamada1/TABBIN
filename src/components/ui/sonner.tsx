import { useTheme } from 'next-themes'
import type { ToasterProps } from 'sonner'
import { Toaster as Sonner } from 'sonner'

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme()
  const sonnerTheme: 'light' | 'dark' | 'system' | undefined =
    theme === 'light' || theme === 'dark' || theme === 'system'
      ? theme
      : 'system'

  return (
    <Sonner
      theme={sonnerTheme}
      className='toaster group'
      toastOptions={{
        classNames: {
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground font-medium',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground font-medium',
          description: 'group-[.toast]:text-muted-foreground',
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
