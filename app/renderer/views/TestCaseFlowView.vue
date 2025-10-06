<template>
  <div class="grid h-full grid-cols-12 gap-4 p-6">
    <aside class="col-span-3 flex flex-col rounded border border-ink-700 bg-ink-800/70 p-4">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold text-surface-50">Test Cases</h1>
        <n-button size="tiny" text @click="refresh">Refresh</n-button>
      </div>
      <n-input v-model:value="search" placeholder="Search tests" class="mt-3" />
      <div class="mt-4 space-y-2 overflow-auto">
        <div
          v-for="test in filteredTests"
          :key="test.id"
          @click="select(test)"
          class="cursor-pointer rounded border border-ink-700 bg-ink-800/40 p-3 text-sm"
          :class="{ 'border-sky-500': test.id === selectedTest?.id }"
        >
          <p class="font-medium text-surface-200">{{ test.title }}</p>
          <p class="text-xs text-surface-300">{{ test.filePath }}</p>
        </div>
      </div>
    </aside>
    <section class="col-span-9 grid grid-cols-12 gap-4">
      <div class="col-span-8 h-full rounded border border-ink-700 bg-ink-800/60 p-2">
        <TestFlow
          v-if="selectedTest"
          :composition="selectedComposition"
          :ui-blocks="uiBlocks"
          :api-blocks="apiBlocks"
          @node-selected="showNode"
        />
        <div v-else class="flex h-full items-center justify-center text-surface-300">Select a test to visualize</div>
      </div>
      <aside class="col-span-4 flex h-full flex-col rounded border border-ink-700 bg-ink-800/80 p-4">
        <h2 class="text-lg font-semibold text-surface-50">Details</h2>
        <div v-if="selectedTest?.environment" class="mt-3 text-xs text-surface-300">
          <p class="uppercase tracking-wide text-surface-400">Environment</p>
          <p class="text-sm text-surface-200">{{ selectedTest.environment.name }}</p>
        </div>
        <div v-if="focusedNode" class="mt-3 space-y-3 text-sm text-surface-200">
          <div>
            <p class="text-xs uppercase text-surface-400">Block</p>
            <p class="font-medium text-surface-50">{{ focusedNode.label }}</p>
          </div>
          <div v-if="focusedNode.details?.kind">
            <p class="text-xs uppercase text-surface-400">Kind</p>
            <p class="font-medium text-surface-50">{{ String(focusedNode.details.kind).toUpperCase() }}</p>
          </div>
          <div v-if="focusedNode.details?.bindings">
            <p class="text-xs uppercase text-surface-400">Bindings</p>
            <pre class="overflow-auto rounded bg-ink-800 p-3 text-xs text-surface-200">{{ pretty(focusedNode.details.bindings) }}</pre>
          </div>
          <div v-if="Array.isArray(focusedNode.details?.params)">
            <p class="text-xs uppercase text-surface-400">Params</p>
            <ul class="space-y-1 text-xs">
              <li v-for="param in paramsList" :key="param.id ?? param.name">
                <strong>{{ param.name }}</strong> ({{ param.type }})<span v-if="!param.required"> optional</span>
              </li>
            </ul>
          </div>
        </div>
        <div v-else class="mt-6 text-sm text-surface-400">Click a node in the flow to see details.</div>
      </aside>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { NButton, NInput } from 'naive-ui';
import TestFlow from '@renderer/components/flow/TestFlow.vue';
import { useTestsStore } from '@renderer/stores/tests';
import { useBlocksStore } from '@renderer/stores/blocks';
import { useApiBlocksStore } from '@renderer/stores/apiBlocks';
import type { ApiBlock, CompositionEntry, StepTemplate } from '@shared/types';

const testsStore = useTestsStore();
const blocksStore = useBlocksStore();
const apiBlocksStore = useApiBlocksStore();

const search = ref('');
const focusedNode = ref<{ label: string; details?: Record<string, unknown> }>();

const uiBlocks = computed(() => blocksStore.items);
const apiBlocks = computed(() => apiBlocksStore.items);
const tests = computed(() => testsStore.items);
const selectedTest = computed(() => testsStore.selected);
const selectedComposition = computed(() => {
  const raw = selectedTest.value?.composition as any;
  if (!raw) return [] as CompositionEntry[];
  if (Array.isArray(raw.nodes)) return raw.nodes as CompositionEntry[];
  if (Array.isArray(raw.blocks)) return raw.blocks as CompositionEntry[];
  return [] as CompositionEntry[];
});
const paramsList = computed(() =>
  Array.isArray(focusedNode.value?.details?.params)
    ? (focusedNode.value?.details?.params as StepTemplate['params'] | ApiBlock['params'])
    : [],
);

const filteredTests = computed(() => {
  const term = search.value.toLowerCase();
  return tests.value.filter((test) => test.title.toLowerCase().includes(term));
});

function pretty(data: unknown) {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function refresh() {
  void testsStore.fetchTests();
  void blocksStore.fetchBlocks();
  void apiBlocksStore.fetchBlocks();
}

function select(test: { id: string }) {
  testsStore.selectTest(test.id);
  focusedNode.value = undefined;
}

function showNode(node?: { label: string; details?: Record<string, unknown> }) {
  focusedNode.value = node;
}

onMounted(() => {
  refresh();
  void apiBlocksStore.fetchBlocks();
});
</script>
