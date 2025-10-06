<template>
  <div class="h-full overflow-auto p-6 text-surface-100">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-surface-50">Recordings</h1>
        <p class="text-sm text-surface-300">Capture user journeys and curate reusable steps.</p>
      </div>
      <div class="flex items-center gap-2">
        <n-input v-model:value="baseUrl" placeholder="https://app.example.com" size="small" class="w-72" />
        <n-button type="default" @click="refresh">Refresh</n-button>
        <n-button type="primary" :loading="isStarting" @click="startRecording">Start Recording</n-button>
        <n-button
          type="error"
          secondary
          :disabled="!canStopRecording"
          :loading="isStopping"
          @click="stopRecording"
        >
          Stop
        </n-button>
      </div>
    </header>
    <div class="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
      <div
        v-for="recording in recordings"
        :key="recording.id"
        class="rounded-xl border border-ink-700 bg-ink-800/70 p-4"
      >
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-semibold text-surface-50">{{ recording.name }}</h2>
            <p class="text-xs text-surface-300">{{ recording.baseUrl }}</p>
          </div>
          <n-button size="tiny" secondary @click="openEditor(recording.id)">Open</n-button>
        </div>
        <p v-if="recording.description" class="mt-2 text-sm text-surface-200">{{ recording.description }}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <span
            v-for="tag in recording.tags"
            :key="tag.id"
            class="rounded-full bg-ink-700/80 px-2 py-1 text-xs text-surface-300"
          >
            {{ tag.name }}
          </span>
        </div>
      </div>
    </div>
    <div
      v-if="!recordings.length"
      class="mt-10 rounded border border-dashed border-ink-700/80 p-10 text-center text-surface-300"
    >
      No recordings yet. Click <strong>Start Recording</strong> to launch the headed recorder.
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { NButton, NInput, useMessage } from 'naive-ui';
import { useRecordingsStore } from '@renderer/stores/recordings';

const store = useRecordingsStore();
const router = useRouter();
const message = useMessage();

const recordings = computed(() => store.items);
const canStopRecording = computed(() => Boolean(store.activeRecorderSessionId));
const baseUrl = ref('');
const isStarting = ref(false);
const isStopping = ref(false);

function openEditor(id: string) {
  store.setActive(id);
  router.push({ name: 'recording-editor', params: { id } });
}

function refresh() {
  void store.fetchRecordings();
}

async function startRecording() {
  if (isStarting.value) return;
  isStarting.value = true;
  try {
    await store.startRecorder({ baseUrl: baseUrl.value.trim() });
    message.success('Recording session launched. Complete your journey and click Stop when finished.');
  } catch (error) {
    console.error('Failed to start recording', error);
    message.error('Unable to start recording session.');
  } finally {
    isStarting.value = false;
  }
}

async function stopRecording() {
  if (!canStopRecording.value || isStopping.value) return;
  isStopping.value = true;
  try {
    const result = await store.stopRecorder();
    if (result?.stopped) {
      message.success('Recording stopped. Artifacts saved to the data directory.');
    } else {
      message.warning('No active recording session to stop.');
    }
  } catch (error) {
    console.error('Failed to stop recording', error);
    message.error('Unable to stop recording session.');
  } finally {
    isStopping.value = false;
  }
}

onMounted(() => {
  void store.fetchRecordings();
});
</script>
