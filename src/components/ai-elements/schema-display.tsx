'use client'

import { ChevronRightIcon } from 'lucide-react'
import type { ComponentProps, HTMLAttributes } from 'react'
import { createContext, use, useMemo } from 'react'

import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useI18nText } from '@/features/i18n/lib/useI18nText'
import { cn } from '@/lib/utils'

const SCHEMA_BASE_PADDING = 40
const SCHEMA_DEPTH_INDENT = 16
const SCHEMA_DESCRIPTION_INDENT = 24

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface SchemaParameter {
  name: string
  type: string
  required?: boolean
  description?: string
  location?: 'path' | 'query' | 'header'
}

interface SchemaProperty {
  name: string
  type: string
  required?: boolean
  description?: string
  properties?: SchemaProperty[]
  items?: SchemaProperty
}

interface SchemaDisplayContextType {
  method: HttpMethod
  path: string
  description?: string
  parameters?: SchemaParameter[]
  requestBody?: SchemaProperty[]
  responseBody?: SchemaProperty[]
}

const SchemaDisplayContext = createContext<SchemaDisplayContextType>({
  method: 'GET',
  path: '',
})

export type SchemaDisplayProps = HTMLAttributes<HTMLDivElement> & {
  method: HttpMethod
  path: string
  description?: string
  parameters?: SchemaParameter[]
  requestBody?: SchemaProperty[]
  responseBody?: SchemaProperty[]
}

export const SchemaDisplay = ({
  method,
  path,
  description,
  parameters,
  requestBody,
  responseBody,
  className,
  children,
  ...props
}: SchemaDisplayProps) => {
  const contextValue = useMemo(
    () => ({
      description,
      method,
      parameters,
      path,
      requestBody,
      responseBody,
    }),
    [description, method, parameters, path, requestBody, responseBody],
  )

  return (
    <SchemaDisplayContext.Provider value={contextValue}>
      <div
        className={cn(
          'overflow-hidden rounded-lg border bg-background',
          className,
        )}
        {...props}
      >
        {children ?? (
          <>
            <SchemaDisplayHeader>
              <div className='flex items-center gap-3'>
                <SchemaDisplayMethod />
                <SchemaDisplayPath />
              </div>
            </SchemaDisplayHeader>
            {description && <SchemaDisplayDescription />}
            <SchemaDisplayContent>
              {parameters && parameters.length > 0 && (
                <SchemaDisplayParameters />
              )}
              {requestBody && requestBody.length > 0 && (
                <SchemaDisplayRequest />
              )}
              {responseBody && responseBody.length > 0 && (
                <SchemaDisplayResponse />
              )}
            </SchemaDisplayContent>
          </>
        )}
      </div>
    </SchemaDisplayContext.Provider>
  )
}

export type SchemaDisplayHeaderProps = HTMLAttributes<HTMLDivElement>

export const SchemaDisplayHeader = ({
  className,
  children,
  ...props
}: SchemaDisplayHeaderProps) => (
  <div
    className={cn('flex items-center gap-3 border-b px-4 py-3', className)}
    {...props}
  >
    {children}
  </div>
)

const methodStyles: Record<HttpMethod, string> = {
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  GET: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  PATCH:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  PUT: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
}

export type SchemaDisplayMethodProps = ComponentProps<typeof Badge>

export const SchemaDisplayMethod = ({
  className,
  children,
  ...props
}: SchemaDisplayMethodProps) => {
  const { method } = use(SchemaDisplayContext)

  return (
    <Badge
      className={cn('font-mono text-xs', methodStyles[method], className)}
      variant='secondary'
      {...props}
    >
      {children ?? method}
    </Badge>
  )
}

export type SchemaDisplayPathProps = HTMLAttributes<HTMLSpanElement>

const renderHighlightedPath = (path: string) => {
  const parts = path.split(/(\{[^}]+\})/g)
  return parts.map((part) => {
    if (!part) {
      return null
    }

    if (part.startsWith('{') && part.endsWith('}')) {
      return (
        <span className='text-blue-600 dark:text-blue-400' key={part}>
          {part}
        </span>
      )
    }

    return part
  })
}

export const SchemaDisplayPath = ({
  className,
  children,
  ...props
}: SchemaDisplayPathProps) => {
  const { path } = use(SchemaDisplayContext)

  return (
    <span className={cn('font-mono text-sm', className)} {...props}>
      {children ?? renderHighlightedPath(path)}
    </span>
  )
}

export type SchemaDisplayDescriptionProps = HTMLAttributes<HTMLParagraphElement>

export const SchemaDisplayDescription = ({
  className,
  children,
  ...props
}: SchemaDisplayDescriptionProps) => {
  const { description } = use(SchemaDisplayContext)

  return (
    <p
      className={cn(
        'border-b px-4 py-3 text-sm text-muted-foreground',
        className,
      )}
      {...props}
    >
      {children ?? description}
    </p>
  )
}

export type SchemaDisplayContentProps = HTMLAttributes<HTMLDivElement>

export const SchemaDisplayContent = ({
  className,
  children,
  ...props
}: SchemaDisplayContentProps) => (
  <div className={cn('divide-y', className)} {...props}>
    {children}
  </div>
)

export type SchemaDisplayParametersProps = ComponentProps<typeof Collapsible>

export const SchemaDisplayParameters = ({
  className,
  children,
  ...props
}: SchemaDisplayParametersProps) => {
  const { parameters } = use(SchemaDisplayContext)
  const t = useI18nText()

  return (
    <Collapsible className={cn(className)} defaultOpen {...props}>
      <CollapsibleTrigger className='group flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50'>
        <ChevronRightIcon className='size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90' />
        <span className='text-sm font-medium'>{t('common.parameters')}</span>
        <Badge className='ml-auto text-xs' variant='secondary'>
          {parameters?.length}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className='divide-y border-t'>
          {children ??
            parameters?.map((param) => (
              <SchemaDisplayParameter key={param.name} {...param} />
            ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export type SchemaDisplayParameterProps = HTMLAttributes<HTMLDivElement> &
  SchemaParameter

export const SchemaDisplayParameter = ({
  name,
  type,
  required,
  description,
  location,
  className,
  ...props
}: SchemaDisplayParameterProps) => {
  const t = useI18nText()

  return (
    <div className={cn('px-4 py-3 pl-10', className)} {...props}>
      <div className='flex items-center gap-2'>
        <span className='font-mono text-sm'>{name}</span>
        <Badge className='text-xs' variant='outline'>
          {type}
        </Badge>
        {location && (
          <Badge className='text-xs' variant='secondary'>
            {location}
          </Badge>
        )}
        {required && (
          <Badge
            className='bg-red-100 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-400'
            variant='secondary'
          >
            {t('common.required')}
          </Badge>
        )}
      </div>
      {description && (
        <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
      )}
    </div>
  )
}

export type SchemaDisplayRequestProps = ComponentProps<typeof Collapsible>

export const SchemaDisplayRequest = ({
  className,
  children,
  ...props
}: SchemaDisplayRequestProps) => {
  const { requestBody } = use(SchemaDisplayContext)
  const t = useI18nText()

  return (
    <Collapsible className={cn(className)} defaultOpen {...props}>
      <CollapsibleTrigger className='group flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50'>
        <ChevronRightIcon className='size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90' />
        <span className='text-sm font-medium'>{t('common.requestBody')}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className='border-t'>
          {children ??
            requestBody?.map((prop) => (
              <SchemaDisplayProperty key={prop.name} {...prop} depth={0} />
            ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export type SchemaDisplayResponseProps = ComponentProps<typeof Collapsible>

export const SchemaDisplayResponse = ({
  className,
  children,
  ...props
}: SchemaDisplayResponseProps) => {
  const { responseBody } = use(SchemaDisplayContext)
  const t = useI18nText()

  return (
    <Collapsible className={cn(className)} defaultOpen {...props}>
      <CollapsibleTrigger className='group flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50'>
        <ChevronRightIcon className='size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90' />
        <span className='text-sm font-medium'>{t('common.response')}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className='border-t'>
          {children ??
            responseBody?.map((prop) => (
              <SchemaDisplayProperty key={prop.name} {...prop} depth={0} />
            ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export type SchemaDisplayBodyProps = HTMLAttributes<HTMLDivElement>

export type SchemaDisplayPropertyProps = HTMLAttributes<HTMLDivElement> &
  SchemaProperty & {
    depth?: number
  }

export const SchemaDisplayProperty = ({
  name,
  type,
  required,
  description,
  properties,
  items,
  depth = 0,
  className,
  ...props
}: SchemaDisplayPropertyProps) => {
  const t = useI18nText()
  const hasChildren = properties ?? items
  const paddingLeft = SCHEMA_BASE_PADDING + depth * SCHEMA_DEPTH_INDENT
  const paddingStyle = useMemo(() => ({ paddingLeft }), [paddingLeft])
  const descriptionPaddingStyle = useMemo(
    () => ({ paddingLeft: paddingLeft + SCHEMA_DESCRIPTION_INDENT }),
    [paddingLeft],
  )

  if (hasChildren) {
    return (
      <Collapsible defaultOpen={depth < 2}>
        <CollapsibleTrigger
          className={cn(
            'group flex w-full items-center gap-2 py-3 text-left transition-colors hover:bg-muted/50',
            className,
          )}
          style={paddingStyle}
        >
          <ChevronRightIcon className='size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90' />
          <span className='font-mono text-sm'>{name}</span>
          <Badge className='text-xs' variant='outline'>
            {type}
          </Badge>
          {required && (
            <Badge
              className='bg-red-100 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-400'
              variant='secondary'
            >
              {t('common.required')}
            </Badge>
          )}
        </CollapsibleTrigger>
        {description && (
          <p
            className='pb-2 text-sm text-muted-foreground'
            style={descriptionPaddingStyle}
          >
            {description}
          </p>
        )}
        <CollapsibleContent>
          <div className='divide-y border-t'>
            {properties?.map((prop) => (
              <SchemaDisplayProperty
                key={prop.name}
                {...prop}
                depth={depth + 1}
              />
            ))}
            {items && (
              <SchemaDisplayProperty
                {...items}
                depth={depth + 1}
                name={`${name}[]`}
              />
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    )
  }

  return (
    <div className={cn('py-3 pr-4', className)} style={paddingStyle} {...props}>
      <div className='flex items-center gap-2'>
        {/* Spacer for alignment */}
        <span className='size-4' />
        <span className='font-mono text-sm'>{name}</span>
        <Badge className='text-xs' variant='outline'>
          {type}
        </Badge>
        {required && (
          <Badge
            className='bg-red-100 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-400'
            variant='secondary'
          >
            {t('common.required')}
          </Badge>
        )}
      </div>
      {description && (
        <p className='mt-1 pl-6 text-sm text-muted-foreground'>{description}</p>
      )}
    </div>
  )
}

export type SchemaDisplayExampleProps = HTMLAttributes<HTMLPreElement>
