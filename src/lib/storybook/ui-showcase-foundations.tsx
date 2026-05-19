import { useState } from 'react'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup, ButtonGroupText } from '@/components/ui/button-group'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const Section = ({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) => (
  <section className='space-y-3 rounded-xl border p-4'>
    <h3 className='font-semibold text-base'>{title}</h3>
    {children}
  </section>
)

const UiShowcase = () => {
  const [checked, setChecked] = useState(true)
  const [enabled, setEnabled] = useState(false)

  return (
    <div className='space-y-6'>
      <Section title='Forms'>
        <div className='grid gap-4 md:grid-cols-2'>
          <Field className='gap-2'>
            <FieldLabel htmlFor='showcase-name'>Project name</FieldLabel>
            <Input id='showcase-name' defaultValue='TABBIN' />
            <FieldDescription>
              Shown to teammates in saved tab lists.
            </FieldDescription>
          </Field>
          <div className='space-y-2'>
            <Label htmlFor='showcase-desc'>Notes</Label>
            <Textarea
              id='showcase-desc'
              defaultValue='Save the tabs for later triage.'
            />
          </div>
        </div>

        <Field className='max-w-md gap-2' data-invalid>
          <FieldLabel htmlFor='showcase-invalid'>Workspace name</FieldLabel>
          <Input
            aria-describedby='showcase-invalid-error'
            aria-invalid
            id='showcase-invalid'
            defaultValue='tabbin'
          />
          <FieldDescription>
            Use a unique name for cross-team analytics views.
          </FieldDescription>
          <FieldError id='showcase-invalid-error'>
            This workspace name is already in use.
          </FieldError>
        </Field>

        <InputGroup>
          <InputGroupAddon>
            <InputGroupText>https://</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput defaultValue='tabbin.app' />
          <InputGroupAddon align='inline-end'>
            <InputGroupButton>Open</InputGroupButton>
          </InputGroupAddon>
        </InputGroup>

        <InputGroup className='max-w-md'>
          <InputGroupAddon align='block-start'>
            <InputGroupText>Command</InputGroupText>
          </InputGroupAddon>
          <InputGroupTextarea defaultValue='Summarize these saved tabs.' />
        </InputGroup>

        <div className='flex items-center gap-6'>
          <div className='flex items-center gap-2'>
            <Checkbox
              checked={checked}
              onCheckedChange={(value) => setChecked(value === true)}
            />
            <span className='text-sm'>Sync across windows</span>
          </div>
          <div className='flex items-center gap-2'>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <span className='text-sm'>Auto-clean</span>
          </div>
          <Spinner />
          <Progress className='w-32' value={68} />
        </div>
      </Section>

      <Section title='Display'>
        <div className='flex flex-wrap items-center gap-3'>
          <Avatar>
            <AvatarImage src='https://placehold.co/64x64/png' />
            <AvatarFallback>TB</AvatarFallback>
          </Avatar>
          <Badge>Saved</Badge>
          <Badge variant='secondary'>Pinned</Badge>
          <Skeleton className='h-10 w-40' />
          <ButtonGroup>
            <Button size='sm' variant='outline'>
              List
            </Button>
            <Button size='sm' variant='outline'>
              Grid
            </Button>
            <ButtonGroupText>View</ButtonGroupText>
          </ButtonGroup>
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Workspace</CardTitle>
              <CardDescription>
                Shared review queue for saved tabs.
              </CardDescription>
            </div>
            <CardAction>
              <Badge variant='secondary'>14 items</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>Review, categorize, and archive tabs here.</CardContent>
          <CardFooter>
            <Button variant='outline'>Inspect</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title='Overlays'>
        <div className='flex flex-wrap gap-3'>
          <Tooltip open>
            <TooltipTrigger asChild>
              <Button variant='outline'>Tooltip</Button>
            </TooltipTrigger>
            <TooltipContent>Compact action hint</TooltipContent>
          </Tooltip>

          <Popover open>
            <PopoverTrigger asChild>
              <Button variant='outline'>Popover</Button>
            </PopoverTrigger>
            <PopoverContent align='start'>
              A lightweight panel for inline controls.
            </PopoverContent>
          </Popover>

          <HoverCard open>
            <HoverCardTrigger asChild>
              <Button variant='outline'>Hover Card</Button>
            </HoverCardTrigger>
            <HoverCardContent>
              Hover details for a saved domain or note.
            </HoverCardContent>
          </HoverCard>

          <DropdownMenu open>
            <DropdownMenuTrigger asChild>
              <Button variant='outline'>Dropdown</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Open tab group</DropdownMenuItem>
              <DropdownMenuItem>Move to archive</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this saved group?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the group from local storage.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Sheet open>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Quick Preview</SheetTitle>
              <SheetDescription>
                Inspect the selected tab without leaving the page.
              </SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>
      </Section>

      <Section title='Structure'>
        <Accordion className='w-full' collapsible type='single'>
          <AccordionItem value='saved'>
            <AccordionTrigger>Saved tabs</AccordionTrigger>
            <AccordionContent>Current workspace snapshot.</AccordionContent>
          </AccordionItem>
        </Accordion>

        <Collapsible defaultOpen>
          <CollapsibleTrigger asChild>
            <Button variant='outline'>Toggle details</Button>
          </CollapsibleTrigger>
          <CollapsibleContent className='pt-3'>
            Collapsible blocks are used for secondary detail.
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        <ScrollArea className='h-24 rounded-md border p-3'>
          <div className='space-y-2'>
            <p>example.com</p>
            <p>openai.com</p>
            <p>vercel.com</p>
            <p>github.com</p>
            <p>storybook.js.org</p>
          </div>
        </ScrollArea>

        <Command className='rounded-lg border shadow-none'>
          <CommandInput placeholder='Filter commands...' />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup heading='Actions'>
              <CommandItem>Save current window</CommandItem>
              <CommandItem>Open analytics</CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </Section>
    </div>
  )
}

export default UiShowcase
