<template>
  <div class="flex h-full bg-transparent text-surface-100">
    <aside class="w-80 border-r border-ink-700 bg-ink-800/80 p-4">
      <h2 class="text-lg font-semibold text-surface-50">Steps</h2>
      <n-skeleton v-if="isLoading" text :repeat="4" class="mt-4" />
      <div v-else class="mt-4 space-y-3 overflow-y-auto pr-2">
        <StepCard
          v-for="step in steps"
          :key="step.id"
          :step="step"
          :selected="step.id === selectedStepId"
          @select="setSelected(step.id)"
        >
          <template #footer>
            <div class="mt-3 flex flex-wrap gap-2">
              <n-button size="tiny" @click="saveAsBlock(step)">Save as Block</n-button>
              <n-button size="tiny" tertiary @click="toggleParameter(step)">
                {{ step.paramHints?.length ? 'Edit params' : 'Add param' }}
              </n-button>
              <n-tooltip trigger="hover">
                <template #trigger>
                  <n-button size="tiny" quaternary :disabled="!aiEnabled" @click="repairSelector(step)">
                    Repair Selector (AI)
                  </n-button>
                </template>
                <span v-if="!aiEnabled">Enable AI in Settings → LLM.</span>
                <span v-else>Infer a robust Playwright locator.</span>
              </n-tooltip>
            </div>
          </template>
        </StepCard>
      </div>
    </aside>
    <section class="flex-1 overflow-auto p-6">
      <header class="flex items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold text-surface-50">Recording Editor</h1>
          <p class="text-sm text-surface-300">Review and parameterize captured steps.</p>
        </div>
        <div class="flex items-center gap-2">
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button quaternary size="small" :disabled="!aiEnabled" @click="summarizeSteps">
                Summarize Steps (AI)
              </n-button>
            </template>
            <span v-if="!aiEnabled">Enable AI in Settings → LLM.</span>
            <span v-else>Generate descriptive labels for each step.</span>
          </n-tooltip>
          <n-button type="primary">Open Trace</n-button>
        </div>
      </header>
      <div class="mt-6 rounded-xl border border-ink-700 bg-ink-800/60 p-6 text-center text-surface-300">
        <img
          v-if="selectedScreenshot"
          :src="selectedScreenshot"
          alt="Step screenshot"
          class="mx-auto max-h-[520px] w-auto rounded border border-ink-700 object-contain"
        />
        <span v-else>Screenshot preview placeholder</span>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, watchEffect } from 'vue';
import { useMessage } from 'naive-ui';
import StepCard from '@renderer/components/StepCard.vue';
import { useRecordingsStore } from '@renderer/stores/recordings';
import { useAiStore } from '@renderer/stores/ai';
import { useRoute, useRouter } from 'vue-router';

const recordings = useRecordingsStore();
const aiStore = useAiStore();
const message = useMessage();
const route = useRoute();
const router = useRouter();

const selectedStepId = ref<string | null>(null);
const selectedScreenshot = ref<string | null>(null);

watchEffect(() => {
  const id = route.params.id as string | undefined;
  if (!id) {
    recordings.setActive(null);
    selectedStepId.value = null;
    return;
  }
  recordings.setActive(id);
  if (!recordings.activeRecording && !recordings.isLoading) {
    void recordings.fetchRecordings().then(() => {
      if (!recordings.activeRecording) {
        message.warning('Recording not found.');
        router.replace({ name: 'recordings' });
        selectedStepId.value = null;
      }
    });
  }
});

const steps = computed(() => recordings.activeRecording?.steps ?? []);
const isLoading = computed(() => recordings.isLoading);
const aiEnabled = computed(() => aiStore.enabled);

function setSelected(id: string) {
  selectedStepId.value = id;
}

watch(
  steps,
  (next) => {
    if (!next.length) {
      selectedStepId.value = null;
      selectedScreenshot.value = null;
      return;
    }
    if (!selectedStepId.value || !next.some((step) => step.id === selectedStepId.value)) {
      selectedStepId.value = next[0].id;
    }
  },
  { immediate: true },
);

watch(
  selectedStepId,
  async (id) => {
    if (!id) {
      selectedScreenshot.value = null;
      return;
    }
    const step = steps.value.find((item) => item.id === id);
    if (!step || !step.screenshot) {
      selectedScreenshot.value = null;
      return;
    }
    try {
      const response = (await window.api.invoke('recording.screenshot', { path: step.screenshot })) as
        | string
        | { dataUrl?: string };
      selectedScreenshot.value = typeof response === 'string' ? response : response?.dataUrl ?? null;
    } catch (error) {
      console.warn('Failed to load screenshot', error);
      selectedScreenshot.value = null;
    }
  },
  { immediate: true },
);

function saveAsBlock(step: unknown) {
  console.debug('Save step as block', step);
}

function toggleParameter(step: unknown) {
  console.debug('Toggle param editing', step);
}

async function repairSelector(step: any) {
  if (!aiEnabled.value) {
    message.info('Enable AI in Settings → LLM to use selector repair.');
    return;
  }
  try {
    const response = (await window.api.invoke('ai.selectorRepair', { step })) as
      | { suggestions?: Array<{ selector: string; confidence?: number }>; error?: string; message?: string }
      | undefined;
    if (!response) return;
    if (response.error) {
      message.error(response.message ?? 'Selector repair unavailable.');
      return;
    }
    const suggestion = response.suggestions?.[0];
    if (!suggestion) {
      message.warning('No selector suggestions were returned.');
      return;
    }
    recordings.updateStep(step.id, { selector: suggestion.selector });
    const confidence = Math.round((suggestion.confidence ?? 0.5) * 100);
    message.success(`Selector updated (${confidence}% confidence).`);
  } catch (error) {
    console.warn('Selector repair failed', error);
    message.error('Failed to repair selector.');
  }
}

async function summarizeSteps() {
  if (!aiEnabled.value) {
    message.info('Enable AI in Settings → LLM to summarize steps.');
    return;
  }
  const payloadSteps = steps.value.map((step) => ({ ...step }));
  try {
    const response = (await window.api.invoke('ai.stepSummaries', { steps: payloadSteps })) as
      | { steps?: Array<{ stepId: string; label: string }>; error?: string; message?: string }
      | undefined;
    if (!response) return;
    if (response.error) {
      message.error(response.message ?? 'Failed to summarize steps.');
      return;
    }
    let applied = 0;
    response.steps?.forEach((item) => {
      recordings.updateStep(item.stepId, { customName: item.label });
      applied += 1;
    });
    if (applied) {
      message.success(`Applied AI labels to ${applied} step${applied === 1 ? '' : 's'}.`);
    } else {
      message.warning('No AI summaries were returned.');
    }
  } catch (error) {
    console.warn('Summarize steps failed', error);
    message.error('Unable to summarize steps.');
  }
}
</script>
