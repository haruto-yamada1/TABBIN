// @covers components/ai-elements/canvas.tsx
// @covers components/ai-elements/connection.tsx
// @covers components/ai-elements/controls.tsx
// @covers components/ai-elements/edge.tsx
// @covers components/ai-elements/node.tsx
// @covers components/ai-elements/panel.tsx
// @covers components/ai-elements/toolbar.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { MarkerType, Position } from '@xyflow/react'
import type { Edge as FlowEdge, Node as FlowNode } from '@xyflow/react'
import { Eye, WandSparkles } from 'lucide-react'
import type { ReactElement } from 'react'

import { Button } from '@/components/ui/button'

import { Canvas } from './canvas'
import { Connection } from './connection'
import { Controls } from './controls'
import { Edge } from './edge'
import {
  Node,
  NodeAction,
  NodeContent,
  NodeDescription,
  NodeFooter,
  NodeHeader,
  NodeTitle,
} from './node'
import { Panel } from './panel'
import { Toolbar } from './toolbar'

export default {
  component: Canvas,
  parameters: {
    layout: 'fullscreen',
  },
  title: 'AI Elements/Flow',
} satisfies Meta<typeof Canvas>

type Story = StoryObj<typeof Canvas>
const PreviewConnection = Connection as unknown as (
  props: Record<string, unknown>,
) => ReactElement
const TemporaryEdge = Edge.Temporary as unknown as (
  props: Record<string, unknown>,
) => ReactElement

const FlowCard = ({
  data,
}: {
  data: { description: string; title: string }
}) => (
  <Node className='w-64' handles={{ source: true, target: true }}>
    <Toolbar isVisible>
      <Button size='sm' variant='outline'>
        <Eye className='size-4' />
        Inspect
      </Button>
    </Toolbar>
    <NodeHeader>
      <div>
        <NodeTitle>{data.title}</NodeTitle>
        <NodeDescription>{data.description}</NodeDescription>
      </div>
      <NodeAction>
        <WandSparkles className='size-4 text-muted-foreground' />
      </NodeAction>
    </NodeHeader>
    <NodeContent className='text-muted-foreground text-sm'>
      Prioritize pinned tabs, then suggest a cleanup batch.
    </NodeContent>
    <NodeFooter className='text-muted-foreground text-xs'>
      Updated 2 minutes ago
    </NodeFooter>
  </Node>
)

const nodes: FlowNode[] = [
  {
    data: {
      description: 'Collects open tabs from the active window.',
      title: 'Ingest tabs',
    },
    id: 'ingest',
    position: { x: 24, y: 96 },
    type: 'flow-card',
  },
  {
    data: {
      description: 'Summarizes groups and flags noisy pages.',
      title: 'Summarize with AI',
    },
    id: 'summarize',
    position: { x: 340, y: 96 },
    type: 'flow-card',
  },
]

const edges: FlowEdge[] = [
  {
    id: 'ingest-to-summarize',
    markerEnd: {
      type: MarkerType.ArrowClosed,
    },
    source: 'ingest',
    target: 'summarize',
    type: 'animated',
  },
]

export const FlowCanvas: Story = {
  render: () => (
    <div className='h-[420px] w-full'>
      <Canvas
        defaultEdges={edges}
        defaultNodes={nodes}
        edgeTypes={{ animated: Edge.Animated }}
        fitViewOptions={{ padding: 0.2 }}
        nodeTypes={{ 'flow-card': FlowCard }}
      >
        <Controls />
        <Panel position='top-left'>
          <div className='px-2 py-1 text-sm'>Workspace graph</div>
        </Panel>
      </Canvas>
    </div>
  ),
}

export const ConnectionPreview: Story = {
  render: () => (
    <div className='space-y-4 p-6'>
      <svg
        aria-label='custom connection line'
        className='h-24 w-full overflow-visible rounded-lg border bg-card p-2'
        viewBox='0 0 320 96'
      >
        <PreviewConnection
          connectionLineType='smoothstep'
          connectionStatus='valid'
          fromHandle={null}
          fromNode={{}}
          fromPosition={Position.Right}
          fromX={24}
          fromY={24}
          pointer={{ x: 280, y: 72 }}
          toHandle={null}
          toNode={null}
          toPosition={Position.Left}
          toX={280}
          toY={72}
        />
      </svg>

      <svg
        aria-label='temporary edge'
        className='h-24 w-full overflow-visible rounded-lg border bg-card p-2'
        viewBox='0 0 320 96'
      >
        <TemporaryEdge
          id='temporary-edge'
          source='source'
          sourcePosition={Position.Right}
          sourceX={24}
          sourceY={24}
          target='target'
          targetPosition={Position.Left}
          targetX={280}
          targetY={72}
        />
      </svg>
    </div>
  ),
}
