<template>
  <div
    class="rounded-xl border border-ink-700 bg-ink-800/70 p-4 shadow-sm transition hover:border-brand-500/60 cursor-pointer"
    :class="{ 'border-brand-500/70 ring-2 ring-brand-400/60': selected }"
    @click="$emit('select')"
  >
    <div class="flex items-center justify-between text-sm text-surface-200">
      <span class="uppercase tracking-wide">{{ step.type }}</span>
      <span>#{{ step.index + 1 }}</span>
    </div>
    <div class="mt-2 text-base font-semibold text-surface-50">
      {{ step.customName || step.name || 'Unnamed step' }}
    </div>
    <div v-if="step.selector" class="mt-1 text-xs text-surface-300">
      {{ step.selector }}
    </div>
    <slot name="footer" />
  </div>
</template>

<script setup lang="ts">
import type { Step } from '@shared/types';

interface Props {
  step: Step;
  selected?: boolean;
}

defineProps<Props>();
defineEmits<{ select: [] }>();
</script>
