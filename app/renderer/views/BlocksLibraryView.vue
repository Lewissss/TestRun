<template>
  <div class="h-full overflow-auto p-6 text-surface-100">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-surface-50">Blocks Library</h1>
        <p class="text-sm text-surface-300">Reusable parameterized actions derived from recordings.</p>
      </div>
      <n-button type="primary" @click="showCreate = true">New Block</n-button>
    </header>
    <div class="mt-6 flex items-center gap-3">
      <n-input v-model:value="search" placeholder="Search blocks" class="max-w-sm" />
      <n-select v-model:value="tag" :options="tagOptions" class="w-48" placeholder="Filter by tag" clearable />
    </div>
    <div class="mt-6">
      <n-tabs v-model:value="activeTab" type="segment" animated>
        <n-tab-pane name="ui" tab="UI Blocks">
          <div v-if="isLoadingUi" class="mt-4">
            <n-skeleton text :repeat="4" />
          </div>
          <div v-else class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div v-for="block in filteredUiBlocks" :key="block.id" :ref="registerBlockRef(block.id)">
              <BlockCard :block="block" :highlighted="highlightedBlockId === block.id" />
            </div>
            <div
              v-if="!filteredUiBlocks.length"
              class="col-span-full rounded border border-dashed border-ink-700/80 p-10 text-center text-surface-300"
            >
              No UI blocks yet. Create one from a recording or author a custom block.
            </div>
          </div>
        </n-tab-pane>
        <n-tab-pane name="api" tab="API Blocks">
          <div v-if="isLoadingApi" class="mt-4">
            <n-skeleton text :repeat="4" />
          </div>
          <div v-else class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div
              v-for="block in filteredApiBlocks"
              :key="block.id"
              class="rounded-xl border border-ink-700 bg-ink-800/80 p-4"
            >
              <div class="flex items-center justify-between">
                <h3 class="text-lg font-semibold text-surface-50">{{ block.title }}</h3>
                <span class="text-xs text-surface-300">v{{ block.version }}</span>
              </div>
              <p v-if="block.description" class="mt-2 text-sm text-surface-200">{{ block.description }}</p>
              <div class="mt-3 text-xs text-surface-300">
                {{ block.actions.length }} action{{ block.actions.length === 1 ? '' : 's' }}
              </div>
              <div class="mt-3 flex flex-wrap gap-2 text-xs text-surface-300">
                <span v-for="tag in block.tags" :key="tag.id" class="rounded-full bg-ink-700/80 px-2 py-1">{{ tag.name }}</span>
              </div>
            </div>
            <div
              v-if="!filteredApiBlocks.length"
              class="col-span-full rounded border border-dashed border-ink-700/80 p-10 text-center text-surface-300"
            >
              No API blocks yet. Save requests from the API console.
            </div>
          </div>
        </n-tab-pane>
      </n-tabs>
    </div>

    <n-modal v-model:show="showCreate" preset="dialog" title="Create Block" style="width: 640px">
      <template #default>
        <n-form label-placement="top" class="space-y-4">
          <n-form-item label="Title">
            <n-input v-model:value="createForm.title" placeholder="Login flow" />
          </n-form-item>
          <n-form-item label="Description">
            <n-input v-model:value="createForm.description" type="textarea" rows="2" placeholder="Optional summary" />
          </n-form-item>
          <n-form-item label="Tags (comma-separated)">
            <n-input v-model:value="createForm.tagInput" placeholder="auth, smoke" />
          </n-form-item>
          <n-form-item label="Block JSON">
            <n-input v-model:value="createForm.blockJson" type="textarea" rows="8" />
          </n-form-item>
          <n-form-item label="Parameters (JSON array)">
            <n-input v-model:value="createForm.paramsJson" type="textarea" rows="4" />
          </n-form-item>
        </n-form>
        <div class="mt-4 flex flex-wrap gap-2">
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button quaternary size="small" :disabled="!aiEnabled" @click="suggestTagsForDraft">Suggest Tags (AI)</n-button>
            </template>
            <span v-if="!aiEnabled">Enable AI in Settings → LLM.</span>
            <span v-else>Generate tag ideas from the draft block.</span>
          </n-tooltip>
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button quaternary size="small" :disabled="!aiEnabled" @click="suggestAssertionsForDraft">Suggest Assertions (AI)</n-button>
            </template>
            <span v-if="!aiEnabled">Enable AI in Settings → LLM.</span>
            <span v-else>Draft assertions to verify this block.</span>
          </n-tooltip>
        </div>
        <ul v-if="aiAssertionSuggestions.length" class="ml-1 mt-3 list-disc space-y-1 pl-4 text-xs text-surface-300">
          <li v-for="item in aiAssertionSuggestions" :key="item">{{ item }}</li>
        </ul>
        <p v-if="createError" class="mt-3 text-sm text-red-400">{{ createError }}</p>
      </template>
      <template #action>
        <n-button @click="showCreate = false" :disabled="isSaving">Cancel</n-button>
        <n-button type="primary" :loading="isSaving" @click="handleCreate">Save Block</n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import { NButton, NInput, NModal, NForm, NFormItem, NSelect, NSkeleton, NTabs, NTabPane, useMessage } from 'naive-ui';
import BlockCard from '@renderer/components/BlockCard.vue';
import { useBlocksStore } from '@renderer/stores/blocks';
import { useTagsStore } from '@renderer/stores/tags';
import { useApiBlocksStore } from '@renderer/stores/apiBlocks';
import { useRoute } from 'vue-router';
import { useAiStore } from '@renderer/stores/ai';

const blocksStore = useBlocksStore();
const tagsStore = useTagsStore();
const apiBlocksStore = useApiBlocksStore();
const route = useRoute();
const aiStore = useAiStore();
const message = useMessage();

const search = ref('');
const tag = ref<string | null>(null);
const showCreate = ref(false);
const isSaving = ref(false);
const createError = ref('');
const highlightedBlockId = ref<string | null>(null);
const pendingHighlightId = ref<string | null>(null);
const activeTab = ref<'ui' | 'api'>('ui');
const aiAssertionSuggestions = ref<string[]>([]);

const blockRefs = new Map<string, HTMLElement>();
const blockRefHandlers = new Map<string, (el: Element | ComponentPublicInstance | null) => void>();

const createForm = reactive({
  title: '',
  description: '',
  tagInput: '',
  blockJson: JSON.stringify(
    [
      { action: 'route', route: 'https://example.com/login' },
      { action: 'click', selector: "button[type='submit']", screenshot: 'step-001.png' },
    ],
    null,
    2,
  ),
  paramsJson: JSON.stringify(
    [
      { name: 'email', type: 'string', required: true },
      { name: 'password', type: 'secret', required: true },
    ],
    null,
    2,
  ),
});

function parseDraftBlockSteps() {
  try {
    const actions = JSON.parse(createForm.blockJson) as Array<Record<string, unknown>>;
    return actions.map((action, index) => {
      const type = (action.action as string) ?? 'click';
      return {
        id: `draft-${index}`,
        recordingId: 'draft',
        index,
        type: type === 'route' ? 'route' : type === 'submit' ? 'submit' : type === 'type' ? 'type' : type === 'assert' ? 'assert' : 'click',
        route: (action.route as string) ?? null,
        selector: (action.selector as string) ?? null,
        role: null,
        name: (action.name as string) ?? null,
        testid: null,
        apiHints: null,
        screenshot: '',
        customName: null,
        deleted: false,
        paramHints: null,
      };
    });
  } catch (error) {
    console.warn('Failed to parse block actions for AI suggestions', error);
    return [];
  }
}

async function suggestTagsForDraft() {
  if (!aiEnabled.value) {
    message.info('Enable AI in Settings → LLM to request tag suggestions.');
    return;
  }
  try {
    const response = (await window.api.invoke('ai.tagSuggest', {
      name: createForm.title || 'Untitled block',
      description: createForm.description || null,
      type: activeTab.value === 'api' ? 'api' : 'block',
      existingTags: createForm.tagInput
        .split(',')
        .map((tagName) => tagName.trim())
        .filter(Boolean),
      stepSamples: parseDraftBlockSteps().slice(0, 5),
    })) as { suggestions?: Array<{ tag: string }>; error?: string; message?: string };

    if (response.error) {
      message.error(response.message ?? 'Failed to fetch tag suggestions.');
      return;
    }
    const tags = response.suggestions?.map((item) => item.tag).filter(Boolean) ?? [];
    if (!tags.length) {
      message.warning('LLM returned no tag suggestions.');
      return;
    }
    createForm.tagInput = tags.join(', ');
    message.success('Applied AI tag suggestions.');
  } catch (error) {
    console.warn('Tag suggestion failed', error);
    message.error('Unable to suggest tags.');
  }
}

async function suggestAssertionsForDraft() {
  if (!aiEnabled.value) {
    message.info('Enable AI in Settings → LLM to request assertion suggestions.');
    return;
  }
  const steps = parseDraftBlockSteps();
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
    const suggestions =
      response.assertions?.map((item) => {
        const valuePart = item.value ? ` → ${item.value}` : '';
        return `${item.operator.toUpperCase()} ${item.selector}${valuePart}${item.description ? ` — ${item.description}` : ''}`;
      }) ?? [];
    aiAssertionSuggestions.value = suggestions;
    if (suggestions.length) {
      message.success('Generated AI assertion suggestions.');
    } else {
      message.warning('LLM returned no assertion suggestions.');
    }
  } catch (error) {
    console.warn('Assertion suggestion failed', error);
    message.error('Unable to suggest assertions.');
  }
}

const filteredUiBlocks = computed(() => {
  const lower = search.value.toLowerCase();
  return blocksStore.items.filter((block) => {
    const matchesSearch =
      !lower || block.title.toLowerCase().includes(lower) || block.description?.toLowerCase().includes(lower);
    const matchesTag = !tag.value || block.tags.some((t) => t.id === tag.value);
    return matchesSearch && matchesTag;
  });
});

const filteredApiBlocks = computed(() => {
  const lower = search.value.toLowerCase();
  return apiBlocksStore.items.filter((block) => {
    const matchesSearch =
      !lower || block.title.toLowerCase().includes(lower) || block.description?.toLowerCase().includes(lower);
    const matchesTag = !tag.value || block.tags.some((t) => t.id === tag.value);
    return matchesSearch && matchesTag;
  });
});

const tagOptions = computed(() => tagsStore.items.map((item) => ({ label: item.name, value: item.id })));
const isLoadingUi = computed(() => blocksStore.isLoading);
const isLoadingApi = computed(() => apiBlocksStore.isLoading);
const aiEnabled = computed(() => aiStore.enabled);

function registerBlockRef(blockId: string) {
  if (!blockRefHandlers.has(blockId)) {
    const handler = (value: Element | ComponentPublicInstance | null) => {
      const candidate =
        value && typeof (value as ComponentPublicInstance).$el !== 'undefined'
          ? ((value as ComponentPublicInstance).$el as Element | null)
          : value;
      if (candidate instanceof HTMLElement) {
        blockRefs.set(blockId, candidate);
      } else {
        blockRefs.delete(blockId);
        blockRefHandlers.delete(blockId);
      }
    };
    blockRefHandlers.set(blockId, handler);
  }
  return (value: Element | ComponentPublicInstance | null, _refs?: Record<string, unknown>) => {
    const handler = blockRefHandlers.get(blockId);
    if (handler) {
      handler(value);
    }
  };
}

function normalizeHighlight(value: unknown): string | null {
  if (Array.isArray(value)) {
    const [first] = value;
    return typeof first === 'string' ? first : null;
  }
  return typeof value === 'string' ? value : null;
}

function normalizeTab(value: unknown): 'ui' | 'api' {
  if (Array.isArray(value)) {
    const [first] = value;
    return first === 'api' ? 'api' : 'ui';
  }
  return value === 'api' ? 'api' : 'ui';
}

watch(
  () => route.query.highlight,
  (value) => {
    const nextId = normalizeHighlight(value);
    if (nextId) {
      activeTab.value = 'ui';
      pendingHighlightId.value = nextId;
      search.value = '';
      tag.value = null;
    } else {
      pendingHighlightId.value = null;
      highlightedBlockId.value = null;
    }
  },
  { immediate: true },
);

watch(
  () => route.query.tab,
  (value) => {
    activeTab.value = normalizeTab(value);
  },
  { immediate: true },
);

watch(
  [() => pendingHighlightId.value, () => blocksStore.isLoading, () => blocksStore.items.length, () => filteredUiBlocks.value.length],
  async ([targetId, loading]) => {
    if (!targetId || loading) return;
    const exists = blocksStore.items.some((item) => item.id === targetId);
    if (!exists) return;
    await nextTick();
    const element = blockRefs.get(targetId);
    highlightedBlockId.value = targetId;
    if (element) {
      requestAnimationFrame(() => {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      pendingHighlightId.value = null;
    }
  },
  { immediate: true },
);

async function handleCreate() {
  createError.value = '';
  isSaving.value = true;
  try {
    const tagNames = createForm.tagInput
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const block = JSON.parse(createForm.blockJson);
    const params = JSON.parse(createForm.paramsJson);
    await blocksStore.createBlock({
      title: createForm.title,
      description: createForm.description,
      block,
      params,
      tagNames,
    });
    showCreate.value = false;
  } catch (error) {
    createError.value = error instanceof Error ? error.message : 'Failed to parse block JSON';
  } finally {
    isSaving.value = false;
  }
}

onMounted(() => {
  void blocksStore.fetchBlocks();
  void tagsStore.fetchTags();
  void apiBlocksStore.fetchBlocks();
});
</script>
