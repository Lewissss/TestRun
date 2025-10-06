<template>
  <div class="h-full overflow-auto bg-ink-900 p-8 text-surface-50">
    <div class="mx-auto max-w-4xl space-y-8">
      <header class="space-y-2">
        <h1 class="text-2xl font-semibold">LLM Settings</h1>
        <p class="text-sm text-surface-300">Configure the local OpenUI endpoint and API key used for optional AI assistance.</p>
      </header>

      <n-card size="large" class="border border-ink-700 bg-ink-800/70">
        <template #header>
          <div class="flex items-center justify-between">
            <span class="font-medium">Connection</span>
            <n-tag v-if="aiStore.enabled" type="success">Enabled</n-tag>
            <n-tag v-else type="warning">Disabled</n-tag>
          </div>
        </template>

        <n-form :model="form" label-placement="left" label-width="160">
          <n-form-item label="API Base URL">
            <n-input v-model:value="form.baseUrl" placeholder="http://localhost:11434" />
          </n-form-item>
          <n-form-item label="Model">
            <n-input v-model:value="form.model" placeholder="openui/gpt-4o-mini" />
          </n-form-item>
          <div class="grid gap-4 md:grid-cols-3">
            <n-form-item label="Temperature">
              <n-input-number v-model:value="form.temperature" :min="0" :max="2" :step="0.1" />
            </n-form-item>
            <n-form-item label="Top P">
              <n-input-number v-model:value="form.topP" :min="0" :max="1" :step="0.05" />
            </n-form-item>
            <n-form-item label="Max Tokens">
              <n-input-number v-model:value="form.maxTokens" :min="64" :max="4096" :step="64" />
            </n-form-item>
          </div>
          <n-form-item label="Enable Cache">
            <n-switch v-model:value="form.enableCache" />
          </n-form-item>
        </n-form>

        <div class="mt-4 flex flex-wrap gap-3">
          <n-button type="primary" :loading="aiStore.isLoading" @click="handleSave">Save Settings</n-button>
          <n-button :loading="aiStore.isTesting" @click="handleTest">Test Connection</n-button>
          <span v-if="aiStore.lastTestResult" class="text-sm" :class="aiStore.lastTestResult.ok ? 'text-emerald-300' : 'text-rose-300'">
            {{ aiStore.lastTestResult.message }}
          </span>
        </div>
      </n-card>

      <n-card size="large" class="border border-ink-700 bg-ink-800/70">
        <template #header>
          <span class="font-medium">API Key</span>
        </template>
        <div class="space-y-4">
          <div class="grid gap-4 md:grid-cols-[2fr,1fr]">
            <n-input v-model:value="apiKey" type="password" show-password-on="click" placeholder="Enter OpenUI API key" />
            <div class="flex items-center gap-2">
              <n-button type="primary" class="flex-1" @click="handleSetKey">Save Key</n-button>
              <n-button class="flex-1" tertiary @click="handleClearKey" :disabled="!aiStore.hasKey">Remove Key</n-button>
            </div>
          </div>
          <n-alert type="info" class="border border-ink-600/70 bg-ink-800/60 text-xs text-surface-200">
            API keys are encrypted locally using Electron safeStorage. Removing the key instantly disables all AI features.
          </n-alert>
        </div>
      </n-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useMessage } from 'naive-ui';
import { useAiStore } from '@renderer/stores/ai';

const aiStore = useAiStore();
const message = useMessage();

const form = reactive({
  baseUrl: aiStore.settings.baseUrl,
  model: aiStore.settings.model,
  temperature: aiStore.settings.temperature,
  topP: aiStore.settings.topP,
  maxTokens: aiStore.settings.maxTokens,
  enableCache: aiStore.settings.enableCache,
});

const apiKey = ref('');

const hasKey = computed(() => aiStore.hasKey);

watch(
  () => aiStore.settings,
  (settings) => {
    form.baseUrl = settings.baseUrl;
    form.model = settings.model;
    form.temperature = settings.temperature;
    form.topP = settings.topP;
    form.maxTokens = settings.maxTokens;
    form.enableCache = settings.enableCache;
  },
  { deep: true },
);

onMounted(() => {
  if (!aiStore.settings.baseUrl) {
    void aiStore.fetchSettings();
  }
});

async function handleSave() {
  await aiStore.updateSettings({ ...form });
  message.success('LLM settings saved.');
}

async function handleSetKey() {
  if (!apiKey.value.trim()) {
    message.warning('Enter an API key before saving.');
    return;
  }
  await aiStore.setApiKey(apiKey.value.trim());
  apiKey.value = '';
  message.success('API key saved. AI features are now enabled.');
}

async function handleClearKey() {
  if (!hasKey.value) return;
  await aiStore.clearApiKey();
  message.info('API key removed. AI features disabled.');
}

async function handleTest() {
  const result = await aiStore.testConnection();
  if (result?.ok) {
    message.success(result.message ?? 'Connection succeeded.');
  } else {
    message.error(result?.message ?? 'Connection failed.');
  }
}
</script>
