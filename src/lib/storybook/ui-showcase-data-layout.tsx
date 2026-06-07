import { ThemeProvider as NextThemeProvider } from 'next-themes'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import type { ChartConfig } from '@/components/ui/chart'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Pie,
  PieChart,
  XAxis,
} from '@/lib/lazy-recharts'

const chartConfig = {
  active: {
    color: 'var(--color-primary)',
    label: 'Active',
  },
  archived: {
    color: 'var(--color-chart-2)',
    label: 'Archived',
  },
} satisfies ChartConfig

const chartData = [
  { active: 24, archived: 4, label: 'Mon' },
  { active: 18, archived: 6, label: 'Tue' },
  { active: 29, archived: 3, label: 'Wed' },
]

const pieData = [
  { fill: 'var(--color-primary)', name: 'Pinned', value: 8 },
  { fill: 'var(--color-chart-2)', name: 'Saved', value: 14 },
  { fill: 'var(--color-chart-3)', name: 'Expired', value: 3 },
]

const Section = ({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) => (
  <section className='space-y-3 rounded-xl border p-4'>
    <h3 className='text-base font-semibold'>{title}</h3>
    {children}
  </section>
)

const DataShowcase = () => (
  <div className='space-y-6'>
    <Section title='Carousel'>
      <div className='mx-12'>
        <Carousel>
          <CarouselContent>
            {['Inbox', 'Focus', 'Research'].map((item) => (
              <CarouselItem className='md:basis-1/2' key={item}>
                <Card>
                  <CardHeader>
                    <CardTitle>{item}</CardTitle>
                  </CardHeader>
                  <CardContent>{item} collection preview.</CardContent>
                </Card>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </div>
    </Section>

    <Section title='Charts'>
      <div className='grid gap-6 lg:grid-cols-2'>
        <ChartContainer className='h-64' config={chartConfig}>
          <BarChart accessibilityLayer data={chartData}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey='label' />
            // eslint-disable-next-line react-perf/jsx-no-jsx-as-prop
            <ChartTooltip content={<ChartTooltipContent />} />
            // eslint-disable-next-line react-perf/jsx-no-jsx-as-prop
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey='active' fill='var(--color-active)' radius={4} />
            <Bar dataKey='archived' fill='var(--color-archived)' radius={4} />
          </BarChart>
        </ChartContainer>

        <ChartContainer className='h-64' config={chartConfig}>
          <PieChart>
            // eslint-disable-next-line react-perf/jsx-no-jsx-as-prop
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Pie data={pieData} dataKey='value' nameKey='name' />
          </PieChart>
        </ChartContainer>
      </div>
    </Section>

    <Section title='Sidebar'>
      <div className='h-[360px] overflow-hidden rounded-xl border'>
        <SidebarProvider defaultOpen>
          <Sidebar>
            <SidebarHeader>
              <SidebarTrigger />
            </SidebarHeader>
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Navigation</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton>Saved Tabs</SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton>Analytics</SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
            <SidebarFooter>
              <Button size='sm' variant='outline'>
                Settings
              </Button>
            </SidebarFooter>
          </Sidebar>
          <SidebarInset>
            <div className='p-4 text-sm'>Sidebar inset content</div>
          </SidebarInset>
        </SidebarProvider>
      </div>
    </Section>

    <Section title='Toast'>
      <NextThemeProvider attribute='class' defaultTheme='light'>
        <div className='flex items-center gap-3'>
          <Button
            // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
            onClick={() => toast.success('Saved to Storybook showcase')}
            variant='outline'
          >
            Show toast
          </Button>
          <Toaster />
        </div>
      </NextThemeProvider>
    </Section>
  </div>
)

export default DataShowcase
