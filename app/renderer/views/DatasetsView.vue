<template>
  <div class="h-full overflow-auto p-6">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-surface-50">Data Sets</h1>
        <p class="text-sm text-surface-300">Reusable parameter bindings for data-driven runs.</p>
      </div>
      <n-button type="primary" @click="showCreate = true">New Data Set</n-button>
    </header>
    <div class="mt-6 rounded border border-ink-700 bg-ink-800/60 p-4">
      <n-data-table :columns="columns" :data="rows" size="small" :loading="isLoading" />
      <div v-if="!rows.length && !isLoading" class="mt-6 rounded border border-dashed border-ink-700 p-6 text-center text-surface-300">
        No data sets defined yet.
      </div>
    </div>

    <n-modal v-model:show="showCreate" preset="dialog" title="Create Data Set" style="width: 560px">
      <template #default>
        <n-form label-placement="top" class="space-y-4">
          <n-form-item label="Name">
            <n-input v-model:value="createForm.name" placeholder="Smoke creds" />
          </n-form-item>
          <n-form-item label="Description">
            <n-input v-model:value="createForm.description" type="textarea" rows="2" />
          </n-form-item>
          <n-form-item label="Bindings (JSON object)">
            <n-input v-model:value="createForm.bindingsJson" type="textarea" rows="6" />
          </n-form-item>
          <n-form-item label="Tags (comma-separated)">
            <n-input v-model:value="createForm.tagInput" placeholder="auth, smoke" />
          </n-form-item>
        </n-form>
        <p v-if="createError" class="mt-3 text-sm text-red-400">{{ createError }}</p>
      </template>
      <template #action>
        <n-button @click="showCreate = false" :disabled="isSaving">Cancel</n-button>
        <n-button type="primary" :loading="isSaving" @click="handleCreate">Save Data Set</n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { NButton, NDataTable, NForm, NFormItem, NInput, NModal } from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import { useDatasetsStore } from '@renderer/stores/datasets';

const datasetsStore = useDatasetsStore();

const columns: DataTableColumns<{ name: string; bindings: string }> = [
  { title: 'Name', key: 'name' },
  { title: 'Bindings', key: 'bindings' },
];

const rows = computed(() =>
  datasetsStore.items.map((dataset) => ({
    name: dataset.name,
    bindings: Object.keys(dataset.bindings ?? {}).join(', '),
  })),
);

const isLoading = computed(() => datasetsStore.isLoading);
const showCreate = ref(false);
const isSaving = ref(false);
const createError = ref('');

const createForm = reactive({
  name: '',
  description: '',
  bindingsJson: JSON.stringify({ email: 'qa@example.com' }, null, 2),
  tagInput: '',
});

async function handleCreate() {
  createError.value = '';
  isSaving.value = true;
  try {
    const bindings = JSON.parse(createForm.bindingsJson) as Record<string, unknown>;
    const tagNames = createForm.tagInput
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    await datasetsStore.upsertDataset({
      name: createForm.name,
      description: createForm.description,
      bindings,
      tagNames,
    });
    showCreate.value = false;
  } catch (error) {
    createError.value = error instanceof Error ? error.message : 'Invalid JSON payload';
  } finally {
    isSaving.value = false;
  }
}

onMounted(() => {
  void datasetsStore.fetchDatasets();
});
</script>
