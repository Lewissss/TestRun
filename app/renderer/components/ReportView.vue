<template>
  <div class="rounded-xl border border-ink-700 bg-ink-800/80 p-4">
    <header class="flex items-center justify-between">
      <h2 class="text-lg font-semibold text-surface-50">Run Report</h2>
      <n-button size="tiny" type="primary" @click="refresh">Refresh</n-button>
    </header>
    <div v-if="!report" class="mt-4 text-sm text-surface-300">
      No report loaded yet.
    </div>
    <div v-else class="mt-4 space-y-4">
      <section v-for="item in report.items" :key="item.id" class="rounded-lg border border-ink-700 bg-ink-900/70 p-3">
        <div class="flex items-center justify-between text-sm text-surface-200">
          <span class="font-medium">{{ item.title }}</span>
          <span :class="statusClass(item.status)">{{ item.status }}</span>
        </div>
        <div v-if="item.diff" class="mt-2 grid grid-cols-2 gap-3">
          <img :src="item.diff.baseline" alt="Baseline" class="rounded border border-ink-800" />
          <img :src="item.diff.actual" alt="Actual" class="rounded border border-ink-800" />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { NButton } from 'naive-ui';

interface ScreenshotDiff {
  baseline: string;
  actual: string;
}

interface ReportEntry {
  id: string;
  title: string;
  status: 'passed' | 'failed' | 'skipped';
  diff?: ScreenshotDiff;
}

interface RunReport {
  items: ReportEntry[];
}

const props = defineProps<{ report?: RunReport }>();
const emit = defineEmits<{ refresh: [] }>();

const report = computed(() => props.report);

function statusClass(status: ReportEntry['status']) {
  switch (status) {
    case 'passed':
      return 'text-accent-500';
    case 'failed':
      return 'text-amberglass';
    default:
      return 'text-surface-300';
  }
}

function refresh() {
  emit('refresh');
}
</script>
