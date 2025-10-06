<template>
  <div
    class="rounded-xl border border-ink-700 bg-ink-800/80 p-4 transition-all hover:border-brand-500/60"
    :class="{
      'border-brand-400 shadow-lg shadow-brand-900/40 ring-1 ring-brand-400 ring-offset-1 ring-offset-ink-900':
        highlighted,
    }"
  >
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold text-surface-50">{{ block.title }}</h3>
      <span class="text-xs text-surface-300">v{{ block.version }}</span>
    </div>
    <p v-if="block.description" class="mt-2 text-sm text-surface-200">
      {{ block.description }}
    </p>
    <div class="mt-3 flex flex-wrap gap-2 text-xs text-surface-300">
      <span v-for="tag in block.tags" :key="tag.id" class="rounded-full bg-ink-700/80 px-2 py-1">{{ tag.name }}</span>
    </div>
    <div class="mt-4 flex flex-wrap gap-2 text-xs text-surface-300">
      <span v-for="param in block.params" :key="param.id" class="rounded border border-ink-700/80 px-2 py-1">
        {{ param.name }}<span v-if="!param.required">?</span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { StepTemplate } from '@shared/types';

interface Props {
  block: StepTemplate;
  highlighted?: boolean;
}

withDefaults(defineProps<Props>(), { highlighted: false });
</script>
