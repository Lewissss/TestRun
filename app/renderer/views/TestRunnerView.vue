<template>
  <div class="grid h-full grid-cols-12 gap-4 p-6">
    <aside class="col-span-4 rounded border border-ink-700 bg-ink-800/60 p-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-surface-50">Runs</h2>
        <n-button size="tiny" text @click="refreshHistory">Refresh</n-button>
      </div>
      <div class="mt-3 space-y-3">
        <div
          v-for="run in runs"
          :key="run.id"
          class="rounded border border-ink-700 bg-ink-800/40 p-3 cursor-pointer"
          :class="{ 'border-brand-400': selectedRunId === run.id }"
          @click="selectedRunId = run.id"
        >
          <div class="flex items-center justify-between text-sm">
            <span class="font-medium text-surface-200">{{ run.testId }}</span>
            <span :class="statusClass(run.status)">{{ run.status }}</span>
          </div>
          <p class="mt-1 text-xs text-surface-300">Started {{ formatTime(run.startedAt) }}</p>
        </div>
      </div>
    </aside>
    <section class="col-span-8 flex flex-col rounded border border-ink-700 bg-ink-800/70 p-4 gap-4">
      <header class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-semibold text-surface-50">Runner</h1>
          <p class="text-sm text-surface-300">Execute generated tests locally and inspect live output.</p>
        </div>
        <div class="flex items-center gap-2">
          <n-switch v-model:value="headed" size="small">Headed</n-switch>
          <n-input-number v-model:value="workers" :min="1" :max="4" size="small" placeholder="Workers" />
          <n-button type="error" size="small" secondary :disabled="!runsStore.isRunning" @click="stopActive">Stop</n-button>
          <n-button type="primary" @click="runSelected">Run Selected</n-button>
        </div>
      </header>
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <span class="text-xs uppercase tracking-wide text-surface-400">Tests</span>
          <n-select
            v-model:value="selectedTests"
            multiple
            :options="testOptions"
            placeholder="Choose generated tests"
          />
        </div>
        <div v-if="summaryStats" class="flex flex-wrap items-center gap-4 text-xs text-surface-200">
          <span><strong>{{ summaryStats.passed }}</strong> passed</span>
          <span><strong>{{ summaryStats.failed }}</strong> failed</span>
          <span><strong>{{ summaryStats.skipped }}</strong> skipped</span>
          <span><strong>{{ summaryStats.total }}</strong> total</span>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-xs text-surface-300">
          <span>Artifacts:</span>
          <n-button v-if="activeSummaryPath" size="tiny" text @click="openPath(activeSummaryPath)">HTML Report</n-button>
          <n-button v-if="activeSummaryPath" size="tiny" text @click="openPath(activeSummaryPath.replace(/index-.*\.html$/, ''))">Report Folder</n-button>
          <n-button v-if="activeLogPath" size="tiny" text @click="openPath(activeLogPath)">Log File</n-button>
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button
                size="tiny"
                tertiary
                :disabled="!aiEnabled || !summaryDetails.length"
                :loading="isAnalyzingFailure"
                @click="analyzeFailure"
              >
                Analyze Failure (AI)
              </n-button>
            </template>
            <span v-if="!aiEnabled">Enable AI in Settings → LLM.</span>
            <span v-else>Summarize likely causes and fixes using AI.</span>
          </n-tooltip>
          <span v-if="!activeSummaryPath && !activeLogPath">Select a run to view artifacts.</span>
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-xs uppercase tracking-wide text-surface-400">Logs</span>
          <div class="h-64 overflow-auto rounded border border-ink-700 bg-ink-900 p-3 font-mono text-xs text-surface-200 whitespace-pre-wrap">
            {{ activeLog || 'No output yet.' }}
          </div>
        </div>
        <div v-if="aiTriage" class="rounded border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
          <h3 class="text-base font-semibold">AI Failure Analysis</h3>
          <p class="mt-2">{{ aiTriage.summary }}</p>
          <div v-if="aiTriage.likelyCauses?.length" class="mt-3">
            <h4 class="text-xs uppercase tracking-wide text-amber-200">Likely Causes</h4>
            <ul class="mt-1 list-disc space-y-1 pl-5">
              <li v-for="cause in aiTriage.likelyCauses" :key="cause">{{ cause }}</li>
            </ul>
          </div>
          <div v-if="aiTriage.suggestedActions?.length" class="mt-3">
            <h4 class="text-xs uppercase tracking-wide text-amber-200">Suggested Actions</h4>
            <ul class="mt-1 list-disc space-y-1 pl-5">
              <li v-for="action in aiTriage.suggestedActions" :key="action">{{ action }}</li>
            </ul>
          </div>
        </div>
        <ReportView :report="report" @refresh="refreshReport" />
        <div v-if="summaryDetails.length" class="border-t border-ink-700 pt-3">
          <h3 class="text-sm font-semibold text-surface-200">Test Breakdown</h3>
          <n-data-table size="small" :columns="summaryColumns" :data="summaryDetails" class="mt-2" />
        </div>
        <p v-if="runError" class="text-sm text-red-400">{{ runError }}</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue';
import type { DataTableColumns } from 'naive-ui';
import { NButton, NInputNumber, NSelect, NSwitch, NDataTable, useMessage } from 'naive-ui';
import ReportView from '@renderer/components/ReportView.vue';
import { useRunsStore } from '@renderer/stores/runs';
import { useTestsStore } from '@renderer/stores/tests';
import type { RunSummaryDetail, RunnerAttachment } from '@shared/types';
import { useAiStore } from '@renderer/stores/ai';

const runsStore = useRunsStore();
const testsStore = useTestsStore();
const aiStore = useAiStore();
const message = useMessage();

const runs = computed(() => runsStore.items);
const headed = ref(false);
const workers = ref(2);
const report = ref();
const selectedTests = ref<string[]>([]);
const selectedRunId = ref<string | null>(null);
const runError = ref('');
const aiTriage = ref<{ summary: string; likelyCauses: string[]; suggestedActions: string[] } | null>(null);
const visualClassifications = ref<Record<string, string>>({});
const isAnalyzingFailure = ref(false);

const testOptions = computed(() =>
  testsStore.items.map((test) => ({
    label: test.title,
    value: test.id,
  })),
);

const activeRun = computed(() => runs.value.find((item) => item.id === selectedRunId.value));
const activeLog = computed(() => (selectedRunId.value ? runsStore.getLog(selectedRunId.value) : ''));
const activeSummaryPath = computed(() => activeRun.value?.summaryPath ?? null);
const activeLogPath = computed(() => activeRun.value?.logPath ?? (activeRun.value ? `tests/logs/${activeRun.value.id}.log` : null));
const summaryStats = computed(() => (selectedRunId.value ? runsStore.getSummary(selectedRunId.value) : undefined));
const summaryDetails = computed(() => (selectedRunId.value ? runsStore.getSummaryDetails(selectedRunId.value) : []));
const aiEnabled = computed(() => aiStore.enabled);
const summaryColumns: DataTableColumns<RunSummaryDetail> = [
  { title: 'Test', key: 'title' },
  { title: 'Status', key: 'status' },
  { title: 'Duration (ms)', key: 'duration' },
  {
    title: 'Error',
    key: 'error',
    render: ({ error }) => error ?? '',
  },
  {
    title: 'Attachments',
    key: 'attachments',
    render: ({ attachments }) => renderAttachmentsCell(attachments),
  },
];

function renderAttachmentsCell(attachments?: RunnerAttachment[]) {
  if (!attachments?.length) return '';
  return h(
    'div',
    { class: 'flex flex-col gap-3' },
    attachments.map((attachment, index) => {
      const headerChildren = [
        h('span', { class: 'font-medium text-surface-50' }, attachment.name ?? `attachment-${index + 1}`),
      ];
      if (attachment.path) {
        headerChildren.push(
          h(
            'a',
            {
              href: '#',
              class: 'text-xs text-brand-400 underline',
              onClick: (event: Event) => {
                event.preventDefault();
                openPath(attachment.path);
              },
            },
            'Open',
          ),
        );
      }
      if (aiEnabled.value && attachment.path) {
        headerChildren.push(
          h(
            NButton,
            {
              size: 'tiny',
              quaternary: true,
              onClick: (event: Event) => {
                event.preventDefault();
                void classifyAttachment(attachment);
              },
            },
            { default: () => 'Classify (AI)' },
          ),
        );
      }

      const bodyNodes: any[] = [];
      if (attachment.previewDataUrl) {
        bodyNodes.push(
          h('img', {
            src: attachment.previewDataUrl,
            alt: attachment.name ?? `attachment-${index + 1}`,
            class: 'max-h-40 w-auto rounded border border-ink-700 bg-ink-900 object-contain',
          }),
        );
      } else if (attachment.path) {
        bodyNodes.push(h('span', { class: 'text-xs text-surface-400' }, 'Open to view attachment in viewer'));
      } else if (attachment.body) {
        bodyNodes.push(
          h(
            'span',
            { class: 'text-xs text-surface-400' },
            attachment.contentType ? `Embedded ${attachment.contentType}` : 'Embedded attachment',
          ),
        );
      }
      const classificationKey = attachment.path ?? attachment.name ?? `attachment-${index}`;
      const classificationLabel = visualClassifications.value[classificationKey];
      if (classificationLabel) {
        bodyNodes.push(h('span', { class: 'text-xs text-amber-300' }, classificationLabel));
      }

      return h(
        'div',
        { class: 'flex flex-col gap-2', key: `${attachment.name ?? index}` },
        [h('div', { class: 'flex items-center gap-2 text-xs text-surface-200' }, headerChildren), ...bodyNodes],
      );
    }),
  );
}

async function openPath(path?: string | null) {
  if (!path) return;
  try {
    await window.api.invoke('runner.openArtifact', { path });
  } catch (error) {
    runError.value = error instanceof Error ? error.message : 'Unable to open artifact';
  }
}

async function analyzeFailure() {
  if (!aiEnabled.value) {
    message.info('Enable AI in Settings → LLM to analyze failures.');
    return;
  }
  if (!summaryDetails.value.length) {
    message.info('Select a completed run to analyze.');
    return;
  }
  isAnalyzingFailure.value = true;
  try {
    const response = (await window.api.invoke('ai.failureTriage', {
      summary: summaryDetails.value,
      logs: activeLog.value,
    })) as { triage?: { summary: string; likelyCauses: string[]; suggestedActions: string[] }; error?: string; message?: string } | undefined;
    if (!response) return;
    if (response.error) {
      message.error(response.message ?? 'Failed to analyze failure.');
      return;
    }
    if (response.triage) {
      aiTriage.value = response.triage;
      message.success('Generated AI failure triage.');
    } else {
      message.warning('LLM did not return a failure analysis.');
    }
  } catch (error) {
    console.warn('AI failure triage failed', error);
    message.error('Unable to analyze failure.');
  } finally {
    isAnalyzingFailure.value = false;
  }
}

async function classifyAttachment(attachment: RunnerAttachment) {
  if (!aiEnabled.value) {
    message.info('Enable AI in Settings → LLM to classify visual diffs.');
    return;
  }
  if (!attachment.path) {
    message.info('Attachment must be saved to disk to classify.');
    return;
  }
  const key = attachment.path;
  try {
    const response = (await window.api.invoke('ai.visualTriage', {
      diffPath: attachment.path,
      metadata: { name: attachment.name, contentType: attachment.contentType },
    })) as { classification?: { classification: string; notes?: string }; error?: string; message?: string } | undefined;
    if (!response) return;
    if (response.error) {
      message.error(response.message ?? 'Failed to classify attachment.');
      return;
    }
    if (!response.classification) {
      message.warning('LLM did not provide a classification.');
      return;
    }
    const notes = response.classification.notes ? ` — ${response.classification.notes}` : '';
    visualClassifications.value[key] = `${response.classification.classification}${notes}`;
    message.success('Generated AI visual classification.');
  } catch (error) {
    console.warn('AI visual classification failed', error);
    message.error('Unable to classify diff.');
  }
}

function runSelected() {
  runError.value = '';
  if (!selectedTests.value.length) {
    runError.value = 'Select at least one test to run.';
    return;
  }
  void runsStore.startRun(selectedTests.value, {
    headed: headed.value,
    workers: workers.value,
  });
}

function stopActive() {
  const target = selectedRunId.value ?? runsStore.currentRunId;
  if (!target) return;
  void runsStore.stopRun(target);
}

function refreshReport() {
  console.debug('Refresh report');
}

function statusClass(status: string) {
  switch (status) {
    case 'passed':
      return 'text-green-400';
    case 'failed':
      return 'text-red-400';
    case 'running':
      return 'text-brand-400';
    default:
      return 'text-surface-300';
  }
}

function formatTime(value: string) {
  return new Date(value).toLocaleString();
}

function refreshHistory() {
  void runsStore.fetchHistory().then(() => {
    if (!selectedRunId.value && runs.value.length) {
      selectedRunId.value = runs.value[0].id;
    }
  });
}

onMounted(() => {
  runsStore.ensureSubscription();
  void testsStore.fetchTests();
  void runsStore.fetchHistory().then(() => {
    if (runs.value.length) {
      selectedRunId.value = runs.value[0].id;
    }
  });
});

watch(
  () => runsStore.currentRunId,
  (next) => {
    if (next) {
      selectedRunId.value = next;
    }
  },
);

watch(
  () => selectedRunId.value,
  (next) => {
    if (next) {
      void runsStore.fetchSummary(next);
    }
    aiTriage.value = null;
    visualClassifications.value = {};
  },
  { immediate: true },
);
</script>
