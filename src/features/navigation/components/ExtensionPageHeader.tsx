interface ExtensionPageHeaderProps {
  description?: string
  title: string
}

export const ExtensionPageHeader = ({
  description,
  title,
}: ExtensionPageHeaderProps) => (
  <header className='mb-8 flex items-start justify-between gap-4'>
    <div>
      <h1 className='text-3xl font-semibold text-foreground'>{title}</h1>
      {description ? (
        <p className='mt-2 text-sm leading-6 text-muted-foreground'>
          {description}
        </p>
      ) : null}
    </div>
  </header>
)
