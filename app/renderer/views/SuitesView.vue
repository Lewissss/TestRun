<template>
  <div class="h-full overflow-auto p-6">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-surface-50">Suites & Tags</h1>
        <p class="text-sm text-surface-300">Organize tests and recordings with tags.</p>
      </div>
      <n-button type="primary">New Tag</n-button>
    </header>
    <div class="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
      <section class="rounded border border-ink-700 bg-ink-800/60 p-4">
        <h2 class="text-lg font-semibold text-surface-50">Tags</h2>
        <n-skeleton v-if="isLoading" text :repeat="5" class="mt-4" />
        <ul v-else class="mt-4 space-y-2 text-sm text-surface-200">
          <li v-for="tag in tags" :key="tag.id" class="flex items-center justify-between rounded border border-ink-700 px-3 py-2">
            <span>{{ tag.name }}</span>
            <n-button size="tiny" text>Assign</n-button>
          </li>
        </ul>
      </section>
      <section class="rounded border border-ink-700 bg-ink-800/60 p-4">
        <h2 class="text-lg font-semibold text-surface-50">Suites</h2>
        <div class="mt-4 rounded border border-dashed border-ink-700 p-6 text-sm text-surface-300">
          Suites are generated based on tag filters. Coming soon.
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { NButton, NSkeleton } from 'naive-ui';
import { useTagsStore } from '@renderer/stores/tags';

const tagsStore = useTagsStore();

const tags = computed(() => tagsStore.items);
const isLoading = computed(() => tagsStore.isLoading);

onMounted(() => {
  void tagsStore.fetchTags();
});
</script>
