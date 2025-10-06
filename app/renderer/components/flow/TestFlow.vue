<template>
  <VueFlow
    v-model:nodes="nodes"
    v-model:edges="edges"
    class="h-full w-full rounded border border-ink-700 bg-ink-900"
    :fit-view="true"
    :elements-draggable="false"
    :nodes-draggable="false"
    :nodes-connectable="false"
    :pan-on-drag="true"
    @node-click="onNodeClick"
  >
    <Background variant="dots" :gap="16" :size="1" />
    <Controls position="top-left" />
    <MiniMap />
  </VueFlow>
</template>

<script setup lang="ts">
import { watch, ref } from 'vue';
import { VueFlow, type Node, type Edge } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { MiniMap } from '@vue-flow/minimap';
import { Controls } from '@vue-flow/controls';
import dagre from 'dagre';
import type { ApiBlock, CompositionEntry, StepTemplate } from '@shared/types';

interface FlowNodeData {
  label: string;
  details?: Record<string, unknown>;
}

const props = defineProps<{
  composition: CompositionEntry[];
  uiBlocks: StepTemplate[];
  apiBlocks: ApiBlock[];
}>();
const emit = defineEmits<{ nodeSelected: [FlowNodeData | undefined] }>();

const nodes = ref<Node<FlowNodeData>[]>([]);
const edges = ref<Edge[]>([]);

watch(
  () => props.composition,
  () => {
    buildFlow();
  },
  { immediate: true, deep: true },
);

watch(
  () => [props.uiBlocks, props.apiBlocks],
  () => {
    buildFlow();
  },
  { deep: true },
);

function buildFlow() {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 120 });
  graph.setDefaultEdgeLabel(() => ({}));

  const flowNodes: Node<FlowNodeData>[] = [];
  const flowEdges: Edge[] = [];

  props.composition.forEach((entry, index) => {
    const kind = (entry as any).kind === 'api' ? 'api' : 'ui';
    const block = kind === 'api'
      ? props.apiBlocks.find((item) => item.id === entry.blockId && item.version === entry.version)
      : props.uiBlocks.find((item) => item.id === entry.blockId && item.version === entry.version);
    const nodeId = `${entry.blockId}-${index}`;
    const labelPrefix = kind === 'api' ? '[API] ' : '';
    const label = block ? `${labelPrefix}${block.title} (v${block.version})` : `${labelPrefix}${entry.blockId}`;

    const data: FlowNodeData = {
      label,
      details: {
        blockId: entry.blockId,
        version: entry.version,
        bindings: entry.bindings,
        params: block?.params ?? [],
        kind,
      },
    };

    flowNodes.push({
      id: nodeId,
      position: { x: 0, y: 0 },
      data,
      style: {
        background: kind === 'api' ? '#0b1222' : '#0f172a',
        color: '#e2e8f0',
        border: kind === 'api' ? '1px solid #0ea5e9' : '1px solid #1f2937',
        padding: '12px',
        borderRadius: '10px',
        width: 260,
      },
    });

    graph.setNode(nodeId, { label, width: 260, height: 80 } as dagre.Node);

    if (index > 0) {
      const prevId = `${props.composition[index - 1].blockId}-${index - 1}`;
      const edgeId = `${prevId}-${nodeId}`;
      flowEdges.push({ id: edgeId, source: prevId, target: nodeId, animated: true });
      graph.setEdge(prevId, nodeId);
    }
  });

  dagre.layout(graph);

  nodes.value = flowNodes.map((node) => {
    const position = graph.node(node.id);
    return {
      ...node,
      position: {
        x: position.x - position.width / 2,
        y: position.y - position.height / 2,
      },
    };
  });

  edges.value = flowEdges;
}

function onNodeClick({ node }: { node: Node<FlowNodeData> }) {
  emit('nodeSelected', node?.data);
}
</script>

<style scoped>
.vue-flow__controls {
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid #1f2937;
  color: #cbd5f5;
}

.vue-flow__minimap {
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid #1f2937;
}
</style>
