// @covers components/ui/tabs.tsx
import type { Meta, StoryObj } from '@storybook/react'

import { Card, CardContent, CardHeader, CardTitle } from './card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs'

export default {
  component: Tabs,
  render: () => (
    <Tabs className='w-[420px]' defaultValue='overview'>
      <TabsList>
        <TabsTrigger value='overview'>概要</TabsTrigger>
        <TabsTrigger value='history'>履歴</TabsTrigger>
        <TabsTrigger value='settings'>設定</TabsTrigger>
      </TabsList>
      <TabsContent value='overview'>
        <Card>
          <CardHeader>
            <CardTitle>タブ一覧の概要</CardTitle>
          </CardHeader>
          <CardContent>保存済み 48 件、期限切れ候補 6 件。</CardContent>
        </Card>
      </TabsContent>
      <TabsContent value='history'>
        <Card>
          <CardHeader>
            <CardTitle>最近の操作</CardTitle>
          </CardHeader>
          <CardContent>カテゴリ再整理と URL 統合を確認できます。</CardContent>
        </Card>
      </TabsContent>
      <TabsContent value='settings'>
        <Card>
          <CardHeader>
            <CardTitle>設定</CardTitle>
          </CardHeader>
          <CardContent>自動削除ルールとテーマを切り替えます。</CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  ),
  title: 'UI/Tabs',
} satisfies Meta<typeof Tabs>

type Story = StoryObj<typeof Tabs>

export const OverviewTabs: Story = {}
