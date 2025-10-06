<template>
  <div class="grid h-full grid-cols-12 gap-4 p-6 text-surface-100">
    <aside class="col-span-3 flex flex-col gap-4 rounded-xl border border-ink-700 bg-ink-800/70 p-4">
      <section>
        <header class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-surface-50">Blocks</h2>
          <n-button size="tiny" text @click="refreshBlocks">Refresh</n-button>
        </header>
        <n-input v-model:value="blockSearch" size="small" placeholder="Search blocks" class="mt-3" />
        <div class="mt-3 space-y-2 overflow-auto">
          <div
            v-for="block in filteredPaletteBlocks"
            :key="`${block.kind}-${block.id}-${block.version}`"
            class="cursor-grab rounded border border-ink-700 bg-ink-800/60 p-3 text-sm"
            draggable="true"
            @dragstart="(event) => onBlockDragStart(block, event)"
          >
            <div class="flex items-center justify-between">
              <p class="font-medium text-surface-50">{{ block.title }}</p>
              <span class="rounded bg-ink-700/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-surface-300">{{ block.kind }}</span>
            </div>
            <p class="text-xs text-surface-400">v{{ block.version }}</p>
          </div>
        </div>
      </section>
      <section class="flex-1 overflow-auto">
        <header class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-surface-50">Existing Tests</h2>
          <n-button size="tiny" text @click="refreshTests">Refresh</n-button>
        </header>
        <n-input v-model:value="testSearch" size="small" placeholder="Search tests" class="mt-3" />
        <div class="mt-3 space-y-2">
          <div
            v-for="test in filteredTests"
            :key="test.id"
            class="cursor-pointer rounded border border-ink-700 bg-ink-800/60 p-3 text-sm"
            :class="{ 'border-brand-400': test.id === currentTestId }"
            @click="loadTest(test)"
          >
            <p class="font-medium text-surface-50">{{ test.title }}</p>
            <p class="text-xs text-surface-300">{{ test.filePath }}</p>
          </div>
        </div>
        <n-button size="tiny" tertiary block class="mt-4" @click="newTest">New Test</n-button>
      </section>
    </aside>

    <section class="col-span-9 grid grid-cols-12 gap-4">
      <div class="col-span-8 flex flex-col gap-4">
        <div class="rounded-xl border border-ink-700 bg-ink-800/70 p-4">
          <div class="grid grid-cols-6 gap-3 text-xs">
            <div>
              <span class="uppercase tracking-wide text-surface-400">Title</span>
              <n-input v-model:value="testTitle" size="small" placeholder="My flow" />
            </div>
            <div>
              <span class="uppercase tracking-wide text-surface-400">Base URL</span>
              <n-input v-model:value="baseUrl" size="small" placeholder="https://app.local" />
            </div>
            <div>
              <span class="uppercase tracking-wide text-surface-400">Viewport</span>
              <div class="grid grid-cols-3 gap-1">
                <n-input-number v-model:value="viewport.width" size="small" :min="320" placeholder="W" />
                <n-input-number v-model:value="viewport.height" size="small" :min="240" placeholder="H" />
                <n-input-number v-model:value="viewport.scale" size="small" :min="1" :max="3" placeholder="Scale" />
              </div>
            </div>
            <div>
              <span class="uppercase tracking-wide text-surface-400">Tags</span>
              <n-select v-model:value="selectedTags" multiple size="small" :options="tagOptions" placeholder="Tags" />
            </div>
            <div>
              <span class="uppercase tracking-wide text-surface-400">Dataset</span>
              <n-select
                v-model:value="selectedDatasetId"
                size="small"
                :options="datasetOptions"
                placeholder="Optional dataset"
                clearable
              />
            </div>
            <div>
              <span class="uppercase tracking-wide text-surface-400">Environment</span>
              <n-select
                v-model:value="selectedEnvironmentId"
                size="small"
                :options="environmentOptions"
                placeholder="Optional environment"
                clearable
              />
            </div>
          </div>
        </div>
        <div class="rounded-xl border border-ink-700 bg-ink-800/70 p-4">
          <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-surface-50">Natural Language Authoring</h2>
            <n-tooltip trigger="hover">
              <template #trigger>
                <n-button
                  size="tiny"
                  type="primary"
                  tertiary
                  :disabled="!aiEnabled"
                  :loading="isGeneratingFromPrompt"
                  @click="generateFromPrompt"
                >
                  Generate Test (AI)
                </n-button>
              </template>
              <span v-if="!aiEnabled">Enable AI in Settings → LLM.</span>
              <span v-else>Draft a test from natural language instructions.</span>
            </n-tooltip>
          </div>
          <n-input
            v-model:value="aiPrompt"
            type="textarea"
            rows="4"
            placeholder="Example: Log in, create a project, verify success banner"
            class="mt-3"
          />
          <div class="mt-2 flex items-center justify-between text-xs text-surface-300">
            <span v-if="!aiEnabled">AI authoring requires an API key in Settings → LLM.</span>
            <n-button size="tiny" text :disabled="!aiPrompt" @click="clearAiPrompt">Clear</n-button>
          </div>
        </div>
        <div class="h-[520px] rounded-xl border border-ink-700 bg-ink-800/70" @dragover.prevent @drop="onCanvasDrop">
          <VueFlow
            v-model:nodes="flowNodes"
            v-model:edges="flowEdges"
            :fit-view-on-init="true"
            :elements-draggable="false"
            :nodes-draggable="false"
            :nodes-connectable="false"
            class="h-full"
            @node-click="onNodeClick"
          >
            <Background variant="dots" :gap="16" :size="1" />
            <Controls />
            <MiniMap />
          </VueFlow>
        </div>
        <div class="flex items-center justify-end gap-3">
          <n-button tertiary size="small" @click="clear">Clear</n-button>
          <n-button type="primary" size="small" :disabled="!canSave" @click="saveTest">Save Test</n-button>
        </div>
      </div>
      <aside class="col-span-4 flex h-full flex-col gap-4 rounded-xl border border-ink-700 bg-ink-800/80 p-4">
        <div>
          <h2 class="text-lg font-semibold text-surface-50">Block Parameters</h2>
          <div v-if="activeNode" class="mt-3 space-y-3">
            <p class="text-sm text-surface-200">{{ activeBlock?.title }} <span class="text-xs text-surface-400">v{{ activeBlock?.version }}</span></p>
            <n-select
              size="small"
              :options="blockOptions"
              :value="`${activeNode.blockId}::${activeNode.version}`"
              @update:value="swapBlock"
            />
            <ParamEditor v-model="activeNode.bindings" :params="activeBlock?.params ?? []" />
            <div class="flex flex-wrap gap-2">
              <n-button size="tiny" tertiary @click="duplicateNode(activeNode.id)">Duplicate</n-button>
              <n-button size="tiny" text @click="openBlockEditor(activeNode.blockId)">Edit Block</n-button>
              <n-button size="tiny" type="error" secondary @click="removeNode(activeNode.id)">Remove</n-button>
            </div>
          </div>
          <div v-else class="mt-4 text-sm text-surface-300">Select a node to edit bindings.</div>
        </div>
        <div class="border-t border-ink-700 pt-4">
          <h2 class="text-lg font-semibold text-surface-50">Expectations</h2>
          <div v-if="activeNode && activeNode.kind === 'ui'" class="mt-3">
            <div class="mb-2 flex justify-end">
              <n-tooltip trigger="hover">
                <template #trigger>
                  <n-button size="tiny" quaternary :disabled="!aiEnabled" @click="suggestExpectationsForActiveNode">
                    Suggest Assertions (AI)
                  </n-button>
                </template>
                <span v-if="!aiEnabled">Enable AI in Settings → LLM.</span>
                <span v-else>Recommend assertions for this block.</span>
              </n-tooltip>
            </div>
            <ExpectationEditor v-model="activeNode.expectations" :selector-options="selectorOptions" />
          </div>
          <div v-else-if="activeNode && activeNode.kind === 'api'" class="mt-4 text-sm text-surface-300">
            Assertions are configured within API blocks. Edit the block to adjust expectations.
          </div>
          <div v-else class="mt-4 text-sm text-surface-300">Select a node to add expectations.</div>
        </div>
      </aside>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { NButton, NInput, NInputNumber, NSelect, useMessage } from 'naive-ui';
import { VueFlow, type Node as FlowNode, type Edge as FlowEdge } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { MiniMap } from '@vue-flow/minimap';
import { Controls } from '@vue-flow/controls';
import dagre from 'dagre';
import ParamEditor from '@renderer/components/ParamEditor.vue';
import ExpectationEditor from '@renderer/components/ExpectationEditor.vue';
import { useBlocksStore } from '@renderer/stores/blocks';
import { useApiBlocksStore } from '@renderer/stores/apiBlocks';
import { useTestsStore } from '@renderer/stores/tests';
import { useTagsStore } from '@renderer/stores/tags';
import { useDatasetsStore } from '@renderer/stores/datasets';
import { useRecordingsStore } from '@renderer/stores/recordings';
import { useEnvironmentsStore } from '@renderer/stores/environments';
import { useAiStore } from '@renderer/stores/ai';
import type { Expectation, StepTemplate, ApiBlock, CompositionEntry } from '@shared/types';

interface FlowNodeData {
  label: string;
}

interface ComposerNode {
  id: string;
  kind: 'ui' | 'api';
  blockId: string;
  version: number;
  bindings: Record<string, string>;
  expectations: Expectation[];
}

interface PaletteBlock {
  id: string;
  title: string;
  version: number;
  kind: 'ui' | 'api';
}

const blocksStore = useBlocksStore();
const apiBlocksStore = useApiBlocksStore();
const testsStore = useTestsStore();
const tagsStore = useTagsStore();
const datasetsStore = useDatasetsStore();
const recordingsStore = useRecordingsStore();
const environmentsStore = useEnvironmentsStore();
const router = useRouter();
const aiStore = useAiStore();
const message = useMessage();

const blockSearch = ref('');
const testSearch = ref('');
const testTitle = ref('Untitled Test');
const baseUrl = ref('https://example.com');
const viewport = reactive({ width: 1366, height: 900, scale: 1 });
const selectedTags = ref<string[]>([]);
const selectedDatasetId = ref<string | null>(null);
const selectedEnvironmentId = ref<string | null>(null);
const currentTestId = ref<string | null>(null);
const aiPrompt = ref('');
const isGeneratingFromPrompt = ref(false);

const composition = ref<ComposerNode[]>([]);
const flowNodes = ref<FlowNode<FlowNodeData>[]>([]);
const flowEdges = ref<FlowEdge[]>([]);
const activeNodeId = ref<string | null>(null);

const uiBlocks = computed(() => blocksStore.items);
const apiBlocks = computed(() => apiBlocksStore.items);
const tests = computed(() => testsStore.items);
const tagOptions = computed(() => tagsStore.items.map((tag) => ({ label: tag.name, value: tag.id })));
const datasetOptions = computed(() => datasetsStore.items.map((dataset) => ({ label: dataset.name, value: dataset.id })));
const environmentOptions = computed(() => environmentsStore.items.map((environment) => ({ label: environment.name, value: environment.id })));
const selectorOptions = computed(() => {
  const selectors = new Set<string>();
  recordingsStore.items.forEach((recording) => {
    recording.steps.forEach((step) => {
      if (step.selector) selectors.add(step.selector);
      if (step.testid) selectors.add(`[data-testid="${step.testid}"]`);
      if (step.name) selectors.add(step.name);
    });
  });
  return Array.from(selectors).filter(Boolean);
});

const aiEnabled = computed(() => aiStore.enabled);

const filteredPaletteBlocks = computed<PaletteBlock[]>(() => {
  const term = blockSearch.value.toLowerCase();
  const uiMatches = uiBlocks.value
    .filter((block) => block.title.toLowerCase().includes(term))
    .map((block) => ({ id: block.id, title: block.title, version: block.version, kind: 'ui' as const }));
  const apiMatches = apiBlocks.value
    .filter((block) => block.title.toLowerCase().includes(term))
    .map((block) => ({ id: block.id, title: block.title, version: block.version, kind: 'api' as const }));
  return [...uiMatches, ...apiMatches];
});

const filteredTests = computed(() => {
  const term = testSearch.value.toLowerCase();
  return tests.value.filter((test) => test.title.toLowerCase().includes(term));
});

const activeNode = computed(() => composition.value.find((node) => node.id === activeNodeId.value));
const activeBlock = computed<StepTemplate | ApiBlock | undefined>(() => {
  if (!activeNode.value) return undefined;
  return activeNode.value.kind === 'ui'
    ? uiBlocks.value.find((block) => block.id === activeNode.value?.blockId && block.version === activeNode.value?.version)
    : apiBlocks.value.find((block) => block.id === activeNode.value?.blockId && block.version === activeNode.value?.version);
});
const blockOptions = computed(() => {
  if (!activeNode.value) return [];
  const source = activeNode.value.kind === 'ui' ? uiBlocks.value : apiBlocks.value;
  return source.map((block) => ({ label: `${block.title} (v${block.version})`, value: `${block.id}::${block.version}` }));
});

const canSave = computed(() => composition.value.length > 0 && !!testTitle.value);

watch(
  () => composition.value,
  () => {
    updateFlow();
  },
  { deep: true },
);

function refreshBlocks() {
  void blocksStore.fetchBlocks();
  void apiBlocksStore.fetchBlocks();
}

function refreshTests() {
  void testsStore.fetchTests();
}

function onBlockDragStart(block: PaletteBlock, event: DragEvent) {
  event.dataTransfer?.setData('application/block-id', block.id);
  event.dataTransfer?.setData('application/block-version', String(block.version));
  event.dataTransfer?.setData('application/block-kind', block.kind);
}

function onCanvasDrop(event: DragEvent) {
  const blockId = event.dataTransfer?.getData('application/block-id');
  const version = Number(event.dataTransfer?.getData('application/block-version'));
  const kind = (event.dataTransfer?.getData('application/block-kind') as 'ui' | 'api' | undefined) ?? 'ui';
  if (!blockId || Number.isNaN(version)) return;
  if (kind === 'ui') {
    const block = uiBlocks.value.find((item) => item.id === blockId && item.version === version);
    if (!block) return;
    addNode({ kind: 'ui', block });
  } else {
    const block = apiBlocks.value.find((item) => item.id === blockId && item.version === version);
    if (!block) return;
    addNode({ kind: 'api', block });
  }
}

function addNode(entry: { kind: 'ui'; block: StepTemplate } | { kind: 'api'; block: ApiBlock }) {
  const { block, kind } = entry;
  const id = `${block.id}-${composition.value.length}-${Date.now()}`;
  composition.value.push({
    id,
    kind,
    blockId: block.id,
    version: block.version,
    bindings: {},
    expectations: [],
  });
  activeNodeId.value = id;
}

function removeNode(nodeId: string) {
  composition.value = composition.value.filter((node) => node.id !== nodeId);
  if (activeNodeId.value === nodeId) {
    const last = composition.value.length ? composition.value[composition.value.length - 1].id : null;
    activeNodeId.value = last;
  }
}

function duplicateNode(nodeId: string) {
  const existing = composition.value.find((node) => node.id === nodeId);
  if (!existing) return;
  const block = existing.kind === 'ui'
    ? uiBlocks.value.find((item) => item.id === existing.blockId && item.version === existing.version)
    : apiBlocks.value.find((item) => item.id === existing.blockId && item.version === existing.version);
  if (!block) return;
  const id = `${existing.blockId}-${composition.value.length}-${Date.now()}`;
  composition.value.push({
    id,
    kind: existing.kind,
    blockId: existing.blockId,
    version: existing.version,
    bindings: { ...existing.bindings },
    expectations: existing.expectations?.map((exp) => ({ ...exp, id: crypto.randomUUID() })) ?? [],
  });
  activeNodeId.value = id;
}

function applyAiComposition(entries: CompositionEntry[]) {
  if (!entries?.length) {
    message.warning('LLM did not produce any steps.');
    return;
  }
  const timestamp = Date.now();
  composition.value = entries.map((entry, index) => ({
    id: `${entry.blockId}-${index}-${timestamp + index}`,
    kind: entry.kind ?? 'ui',
    blockId: entry.blockId,
    version: entry.version,
    bindings: Object.fromEntries(
      Object.entries((entry.bindings ?? {}) as Record<string, unknown>).map(([key, value]) => [
        key,
        typeof value === 'string' ? value : JSON.stringify(value),
      ]),
    ),
    expectations: entry.kind === 'ui' ? entry.expectations ?? [] : [],
  }));
  activeNodeId.value = composition.value[0]?.id ?? null;
}

async function generateFromPrompt() {
  if (!aiEnabled.value) {
    message.info('Enable AI in Settings → LLM to generate tests from natural language.');
    return;
  }
  if (!aiPrompt.value.trim()) {
    message.warning('Describe the flow you want to generate.');
    return;
  }
  isGeneratingFromPrompt.value = true;
  const availableBlocks = [
    ...uiBlocks.value.map((block) => ({
      id: block.id,
      title: block.title,
      kind: 'ui' as const,
      params: block.params.map((param) => param.name),
    })),
    ...apiBlocks.value.map((block) => ({
      id: block.id,
      title: block.title,
      kind: 'api' as const,
      params: block.params.map((param) => param.name),
    })),
  ];
  try {
    const response = (await window.api.invoke('ai.nlToComposition', {
      instructions: aiPrompt.value,
      availableBlocks,
      baseUrl: baseUrl.value,
    })) as { composition?: { title?: string; description?: string; steps?: CompositionEntry[] }; error?: string; message?: string } | undefined;
    if (!response) return;
    if (response.error) {
      message.error(response.message ?? 'Failed to generate a composition.');
      return;
    }
    const suggestion = response.composition;
    if (!suggestion) {
      message.warning('LLM returned no composition.');
      return;
    }
    if (suggestion.title) {
      testTitle.value = suggestion.title;
    }
    if (suggestion.steps?.length) {
      applyAiComposition(suggestion.steps);
      updateFlow();
      message.success('Generated test composition from natural language.');
    } else {
      message.warning('LLM did not include any steps.');
    }
  } catch (error) {
    console.warn('AI composition failed', error);
    message.error('Unable to generate test from instructions.');
  } finally {
    isGeneratingFromPrompt.value = false;
  }
}

function clearAiPrompt() {
  aiPrompt.value = '';
}

async function suggestExpectationsForActiveNode() {
  if (!aiEnabled.value) {
    message.info('Enable AI in Settings → LLM to suggest assertions.');
    return;
  }
  const node = activeNode.value;
  if (!node) {
    message.info('Select a block to receive suggestions.');
    return;
  }
  if (node.kind !== 'ui') {
    message.info('Assertion suggestions are available for UI blocks.');
    return;
  }
  const block = uiBlocks.value.find((item) => item.id === node.blockId && item.version === node.version);
  if (!block) {
    message.warning('Unable to locate block definition for suggestions.');
    return;
  }
  const steps = (block.block ?? []).map((action, index) => ({
    id: `${block.id}-${index}`,
    recordingId: block.id,
    index,
    type: (action.action as string) === 'route'
      ? 'route'
      : (action.action as string) === 'submit'
      ? 'submit'
      : (action.action as string) === 'type'
      ? 'type'
      : (action.action as string) === 'assert'
      ? 'assert'
      : 'click',
    route: (action.route as string) ?? null,
    selector: (action.selector as string) ?? null,
    role: (action.role as string) ?? null,
    name: (action.name as string) ?? null,
    testid: null,
    apiHints: null,
    screenshot: (action.screenshot as string) ?? '',
    customName: (action.name as string) ?? null,
    deleted: false,
    paramHints: null,
  }));
  try {
    const response = (await window.api.invoke('ai.assertSuggest', { steps })) as {
      assertions?: Array<{ selector: string; operator: string; value?: string; description?: string }>;
      error?: string;
      message?: string;
    };
    if (response.error) {
      message.error(response.message ?? 'Failed to fetch assertion suggestions.');
      return;
    }
    const suggestions = response.assertions ?? [];
    if (!suggestions.length) {
      message.warning('LLM returned no assertion suggestions.');
      return;
    }
    node.expectations = suggestions.map((item) => ({
      id: crypto.randomUUID(),
      type: 'assert' as const,
      operator: (item.operator as Expectation['operator']) ?? 'equals',
      selector: item.selector,
      value: item.value,
    }));
    message.success('Applied AI assertion suggestions.');
  } catch (error) {
    console.warn('AI assertion suggestions failed', error);
    message.error('Unable to suggest assertions for this block.');
  }
}

function swapBlock(value: string) {
  if (!activeNode.value) return;
  const [blockId, versionStr] = value.split('::');
  const version = Number(versionStr);
  const block = activeNode.value.kind === 'ui'
    ? uiBlocks.value.find((item) => item.id === blockId && item.version === version)
    : apiBlocks.value.find((item) => item.id === blockId && item.version === version);
  if (!block) return;
  activeNode.value.blockId = block.id;
  activeNode.value.version = block.version;
  activeNode.value.bindings = {};
  activeNode.value.expectations = [];
}

function openBlockEditor(blockId: string) {
  const tab = activeNode.value?.kind ?? 'ui';
  router.push({ name: 'blocks', query: { highlight: blockId, tab } });
}

function updateFlow() {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 140 });
  graph.setDefaultEdgeLabel(() => ({}));

  composition.value.forEach((node, index) => {
    graph.setNode(node.id, { width: 280, height: 90 } as dagre.Node);
    if (index > 0) {
      const prev = composition.value[index - 1].id;
      graph.setEdge(prev, node.id);
    }
  });

  dagre.layout(graph);

  flowNodes.value = composition.value.map((node) => {
    const position = graph.node(node.id);
    const block = node.kind === 'ui'
      ? uiBlocks.value.find((item) => item.id === node.blockId && item.version === node.version)
      : apiBlocks.value.find((item) => item.id === node.blockId && item.version === node.version);
    const labelPrefix = node.kind === 'api' ? '[API] ' : '';
    return {
      id: node.id,
      data: {
        label: `${labelPrefix}${block?.title ?? node.blockId} (v${node.version})`,
      },
      position: {
        x: position.x - position.width / 2,
        y: position.y - position.height / 2,
      },
      style: {
        background: node.kind === 'api' ? '#0b1222' : '#0f172a',
        color: '#e2e8f0',
        border: node.kind === 'api' ? '1px solid #0ea5e9' : '1px solid #1f2937',
        padding: '12px',
        borderRadius: '10px',
        width: 280,
      },
    } satisfies FlowNode<FlowNodeData>;
  });

  flowEdges.value = composition.value.slice(1).map((node, index) => ({
    id: `${composition.value[index].id}-${node.id}`,
    source: composition.value[index].id,
    target: node.id,
    animated: true,
  })) as FlowEdge[];
}

function onNodeClick({ node }: { node: FlowNode<FlowNodeData> }) {
  activeNodeId.value = node.id;
}

function saveTest() {
  if (!canSave.value) return;
  const payload = {
    testId: currentTestId.value ?? undefined,
    title: testTitle.value,
    blocks: composition.value.map((node) => ({
      kind: node.kind,
      blockId: node.blockId,
      version: node.version,
      bindings: node.bindings,
      expectations: node.kind === 'ui' ? node.expectations : undefined,
    })),
    baseUrl: baseUrl.value,
    viewport: { ...viewport },
    tagNames: selectedTags.value,
    datasetId: selectedDatasetId.value ?? undefined,
    environmentId: selectedEnvironmentId.value ?? undefined,
  };
  void testsStore.composeTest(payload).then(() => {
    refreshTests();
  });
}

function loadTest(test: { id: string; title: string; composition: unknown; environmentId?: string | null; }) {
  currentTestId.value = test.id;
  testTitle.value = test.title;
  const compositionData = (test.composition as any) ?? {};
  const nodesData: any[] = compositionData.nodes ?? compositionData.blocks ?? [];
  const meta = compositionData.meta ?? {};
  baseUrl.value = meta.baseUrl ?? 'https://example.com';
  viewport.width = meta.viewport?.width ?? 1366;
  viewport.height = meta.viewport?.height ?? 900;
  viewport.scale = meta.viewport?.scale ?? 1;
  selectedDatasetId.value = meta.datasetId ?? null;
  selectedEnvironmentId.value = meta.environmentId ?? (test as any).environmentId ?? (test as any).environment?.id ?? null;
  selectedTags.value = (test as any).tags?.map((tag: { id: string }) => tag.id) ?? [];
  composition.value = nodesData.map((block, index) => ({
    id: `${block.blockId}-${index}-${Date.now()}`,
    kind: (block.kind as 'ui' | 'api' | undefined) ?? 'ui',
    blockId: block.blockId,
    version: block.version,
    bindings: { ...(block.bindings ?? {}) },
    expectations: block.kind === 'api' ? [] : block.expectations ?? [],
  }));
  activeNodeId.value = composition.value[0]?.id ?? null;
}

function newTest() {
  currentTestId.value = null;
  testTitle.value = 'Untitled Test';
  baseUrl.value = 'https://example.com';
  viewport.width = 1366;
  viewport.height = 900;
  viewport.scale = 1;
  selectedDatasetId.value = null;
  selectedEnvironmentId.value = null;
  selectedTags.value = [];
  composition.value = [];
  activeNodeId.value = null;
}

function clear() {
  composition.value = [];
  activeNodeId.value = null;
}

onMounted(() => {
  refreshBlocks();
  refreshTests();
  void tagsStore.fetchTags();
  void datasetsStore.fetchDatasets();
  void recordingsStore.fetchRecordings();
  void environmentsStore.fetchEnvironments();
});
</script>
