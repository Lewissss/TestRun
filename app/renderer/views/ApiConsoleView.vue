<template>
  <div class="grid h-full grid-cols-12 gap-4 p-6">
    <aside class="col-span-3 flex flex-col rounded border border-ink-700 bg-ink-800/70">
      <header class="flex items-center justify-between border-b border-ink-700 px-4 py-3">
        <div>
          <h2 class="text-lg font-semibold text-surface-50">API Collections</h2>
          <p class="text-xs text-surface-400">Sessions & recent requests</p>
        </div>
        <n-button size="tiny" type="primary" @click="showCreateSession = true">New</n-button>
      </header>
      <div class="flex-1 overflow-auto">
        <div v-if="apiSessionsStore.isLoading" class="p-4 text-sm text-surface-300">Loading sessions…</div>
        <div v-else>
          <div v-for="session in apiSessionsStore.sessions" :key="session.id" class="border-b border-ink-700">
            <button
              class="flex w-full items-center justify-between px-4 py-3 text-left text-sm transition hover:bg-ink-700/60"
              :class="{ 'bg-ink-700 text-surface-50': apiSessionsStore.activeSessionId === session.id }"
              @click="selectSession(session.id)"
            >
              <span class="font-medium">{{ session.name }}</span>
              <span class="text-xs text-surface-400">{{ session.requests.length }}</span>
            </button>
            <div v-if="apiSessionsStore.activeSessionId === session.id" class="space-y-1 border-t border-ink-700 px-4 py-3">
              <n-button size="tiny" tertiary block @click="createRequest(session.id)">New Request</n-button>
              <div
                v-for="request in session.requests"
                :key="request.id"
                class="rounded px-2 py-1 text-xs transition hover:bg-ink-700"
                :class="{ 'bg-ink-700 text-surface-50': apiSessionsStore.activeRequestId === request.id }"
                @click="selectRequest(request.id)"
              >
                <div class="flex items-center justify-between">
                  <span class="uppercase text-surface-300">{{ request.method }}</span>
                  <span class="text-surface-400">{{ request.lastStatus ?? '—' }}</span>
                </div>
                <p class="truncate text-surface-200">{{ request.name }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>

    <section class="col-span-5 flex flex-col gap-3 rounded border border-ink-700 bg-ink-800/60 p-4">
      <header class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-semibold text-surface-50">Request Builder</h1>
          <p class="text-sm text-surface-400">Craft HTTP calls with environment variables and scripts.</p>
        </div>
        <div class="flex items-center gap-2">
          <n-select v-model:value="requestForm.method" :options="methodOptions" size="small" style="width: 120px" />
          <n-input v-model:value="requestForm.url" placeholder="https://api.example.com/resource" class="w-96" />
          <n-button type="primary" :loading="isSending" @click="sendRequest">Send</n-button>
        </div>
      </header>
      <div class="mt-2 flex items-center justify-between text-xs text-surface-300">
        <div class="flex items-center gap-2">
          <input ref="importInput" type="file" accept="application/json" class="hidden" @change="onImportFile" />
          <n-button size="tiny" tertiary :loading="isImporting" @click="triggerImport">Import</n-button>
          <n-button size="tiny" tertiary @click="exportCollections">Export</n-button>
        </div>
        <span v-if="exportMessage" class="text-surface-400">Saved to {{ exportMessage }}</span>
        <span v-else-if="importError" class="text-amberglass">{{ importError }}</span>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <n-card size="small" class="bg-ink-900/70">
          <template #header>
            <div class="flex items-center justify-between">
              <span class="text-sm font-semibold">Headers</span>
              <n-button size="tiny" tertiary @click="formatJson('headers')">Format</n-button>
            </div>
          </template>
          <n-input
            v-model:value="requestForm.headersText"
            type="textarea"
            rows="6"
            placeholder='{ "Content-Type": "application/json" }'
          />
        </n-card>
        <n-card size="small" class="bg-ink-900/70">
          <template #header>
            <div class="flex items-center justify-between">
              <span class="text-sm font-semibold">Query Params</span>
              <n-button size="tiny" tertiary @click="formatJson('query')">Format</n-button>
            </div>
          </template>
          <n-input
            v-model:value="requestForm.queryText"
            type="textarea"
            rows="6"
            placeholder='{ "page": 1 }'
          />
        </n-card>
      </div>

      <n-card size="small" class="bg-ink-900/70">
        <template #header>
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold">Body</span>
            <n-select v-model:value="requestForm.bodyMode" :options="bodyModeOptions" size="tiny" style="width: 140px" />
          </div>
        </template>
        <n-input
          v-model:value="requestForm.body"
          type="textarea"
          rows="8"
          placeholder='{ "name": "Example" }'
        />
      </n-card>

      <div class="grid grid-cols-2 gap-3">
        <n-card size="small" class="bg-ink-900/70">
          <template #header>
            <span class="text-sm font-semibold">Pre-request Script</span>
          </template>
          <n-input v-model:value="requestForm.preScripts" type="textarea" rows="6" placeholder="ctx.request.headers['X-Signature'] = sign(params);" />
        </n-card>
        <n-card size="small" class="bg-ink-900/70">
          <template #header>
            <span class="text-sm font-semibold">Post-response Script</span>
          </template>
          <n-input v-model:value="requestForm.postScripts" type="textarea" rows="6" placeholder="const json = await resp.json(); ctx.set('orderId', json.id);" />
        </n-card>
      </div>

      <n-card size="small" class="bg-ink-900/70">
        <template #header>
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold">Assertions</span>
            <n-button size="tiny" tertiary @click="addAssertion">Add</n-button>
          </div>
        </template>
        <div v-if="!assertions.length" class="text-xs text-surface-400">No assertions defined.</div>
        <div v-else class="space-y-2">
         <div
            v-for="(assertion, index) in assertions"
            :key="assertion.id"
            class="grid grid-cols-12 items-center gap-2 rounded border border-ink-700 bg-ink-900/60 px-3 py-2"
          >
            <n-select
              :value="assertion.type"
              :options="assertTypeOptions"
              size="tiny"
              class="col-span-3"
              @update:value="(value) => setAssertionType(index, value as AssertionType)"
            />
            <template v-if="assertion.type === 'status'">
              <span class="col-span-2 text-xs uppercase text-surface-400">Equals</span>
              <n-input-number
                :value="typeof assertion.expected === 'number' ? assertion.expected : Number(assertion.expected ?? 200)"
                class="col-span-3"
                size="tiny"
                @update:value="(value) => updateAssertion(index, { expected: value ?? null })"
              />
            </template>
            <template v-else-if="assertion.type === 'header'">
              <n-input
                :value="assertion.name ?? ''"
                placeholder="content-type"
                size="tiny"
                class="col-span-3"
                @update:value="(value) => updateAssertion(index, { name: value })"
              />
              <n-input
                :value="String(assertion.expected ?? '')"
                placeholder="contains json"
                size="tiny"
                class="col-span-4"
                @update:value="(value) => updateAssertion(index, { expected: value })"
              />
            </template>
            <template v-else>
              <n-input
                :value="assertion.path ?? ''"
                placeholder="data.items[0].id"
                size="tiny"
                class="col-span-4"
                @update:value="(value) => updateAssertion(index, { path: value })"
              />
              <n-input
                :value="String(assertion.expected ?? '')"
                placeholder="expected value"
                size="tiny"
                class="col-span-4"
                @update:value="(value) => updateAssertion(index, { expected: value })"
              />
            </template>
            <n-button size="tiny" text class="col-span-1 justify-self-end" @click="removeAssertion(index)">Remove</n-button>
          </div>
        </div>
      </n-card>

      <footer class="flex items-center justify-between border-t border-ink-700 pt-3">
        <div class="flex items-center gap-3">
          <n-select
            v-model:value="activeEnvironmentId"
            :options="environmentOptions"
            placeholder="Environment"
            class="w-56"
            clearable
          />
          <n-button size="tiny" tertiary @click="showEnvironmentModal = true">Manage Environments</n-button>
        </div>
        <div class="flex items-center gap-2">
          <n-button type="success" secondary @click="saveRequest">Save</n-button>
          <n-button type="warning" secondary @click="saveAsBlock">Save as Block</n-button>
        </div>
      </footer>
    </section>

    <section class="col-span-4 flex flex-col gap-3 rounded border border-ink-700 bg-ink-800/60 p-4">
      <header class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-semibold text-surface-50">Response Inspector</h2>
          <p class="text-xs text-surface-400">Status, headers, body preview</p>
        </div>
        <div class="text-xs text-surface-400">
          <span>Status: <strong>{{ response.status ?? '—' }}</strong></span>
          <span class="ml-3">Time: {{ response.latencyMs ? response.latencyMs + ' ms' : '—' }}</span>
        </div>
      </header>
      <n-card size="small" class="bg-ink-900/70">
        <template #header>
          <span class="text-sm font-semibold">Headers</span>
        </template>
        <pre class="max-h-40 overflow-auto whitespace-pre-wrap break-all text-xs text-emerald-200">{{ formattedHeaders }}</pre>
      </n-card>
      <n-card size="small" class="flex-1 bg-ink-900/70">
        <template #header>
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold">Body</span>
            <div class="text-xs text-surface-400">{{ response.size ? response.size + ' bytes' : '' }}</div>
          </div>
        </template>
        <div v-if="response.bodyPath" class="flex items-center justify-between rounded border border-ink-700 bg-ink-800 px-3 py-2 text-xs text-surface-300">
          <span>Body too large for inline preview.</span>
          <n-button size="tiny" tertiary @click="openArtifact(response.bodyPath)">Open File</n-button>
        </div>
        <pre v-else class="h-full overflow-auto whitespace-pre-wrap break-all text-xs text-blue-100">{{ formattedBody }}</pre>
      </n-card>
      <n-card v-if="response.captures && Object.keys(response.captures).length" size="small" class="bg-ink-900/70">
        <template #header><span class="text-sm font-semibold">Captured Variables</span></template>
        <dl class="grid grid-cols-2 gap-2 text-xs text-surface-200">
          <template v-for="(value, key) in response.captures" :key="key">
            <dt class="font-semibold">{{ key }}</dt>
            <dd>{{ value }}</dd>
          </template>
        </dl>
      </n-card>
      <n-card v-if="response.logs.length" size="small" class="bg-ink-900/70">
        <template #header><span class="text-sm font-semibold">Logs</span></template>
        <pre class="max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-surface-200">{{ response.logs.join('\n') }}</pre>
      </n-card>
    </section>

    <n-modal v-model:show="showCreateSession" preset="dialog" title="New API Session" style="width: 520px">
      <n-form label-placement="top" class="space-y-3">
        <n-form-item label="Name"><n-input v-model:value="sessionForm.name" placeholder="Checkout API" /></n-form-item>
        <n-form-item label="Description"><n-input v-model:value="sessionForm.description" type="textarea" rows="2" /></n-form-item>
        <n-form-item label="Base URL"><n-input v-model:value="sessionForm.baseUrl" placeholder="https://api.example.com" /></n-form-item>
      </n-form>
      <template #action>
        <n-button @click="showCreateSession = false">Cancel</n-button>
        <n-button type="primary" :loading="isSavingSession" @click="saveSession">Save</n-button>
      </template>
    </n-modal>

    <n-modal v-model:show="showEnvironmentModal" preset="dialog" title="Environments" style="width: 600px">
      <div class="space-y-3">
        <div v-for="env in environmentsStore.items" :key="env.id" class="rounded border border-ink-700 p-3">
          <div class="flex items-center justify-between text-sm">
            <div>
              <p class="font-semibold text-surface-50">{{ env.name }}</p>
              <p class="text-xs text-surface-400">{{ env.description || '—' }}</p>
            </div>
            <div class="flex items-center gap-2">
              <n-button size="tiny" tertiary @click="editEnvironment(env)">Edit</n-button>
              <n-button size="tiny" tertiary type="error" @click="removeEnvironment(env.id)">Delete</n-button>
            </div>
          </div>
        </div>
        <n-divider dashed>New Environment</n-divider>
        <n-input v-model:value="environmentForm.name" placeholder="Environment name" />
        <n-input v-model:value="environmentForm.description" placeholder="Description" />
        <n-input v-model:value="environmentForm.variables" type="textarea" rows="6" placeholder='{ "token": "${SECRET:API_TOKEN}" }' />
        <div class="flex justify-end gap-2">
          <n-button size="tiny" tertiary @click="resetEnvironmentForm">Clear</n-button>
          <n-button size="tiny" type="primary" @click="saveEnvironment">Save Environment</n-button>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { NButton, NCard, NDivider, NForm, NFormItem, NInput, NInputNumber, NModal, NSelect } from 'naive-ui';
import { useApiSessionsStore, type ApiExecutionResult } from '@renderer/stores/apiSessions';
import { useApiBlocksStore } from '@renderer/stores/apiBlocks';
import { useEnvironmentsStore } from '@renderer/stores/environments';

type AssertionType = 'status' | 'header' | 'jsonPath';
type BodyMode = 'auto' | 'json' | 'text' | 'form' | 'multipart';

interface AssertionState {
  id: string;
  type: AssertionType;
  name?: string;
  path?: string;
  expected?: number | string | null;
}

const apiSessionsStore = useApiSessionsStore();
const apiBlocksStore = useApiBlocksStore();
const environmentsStore = useEnvironmentsStore();

const methodOptions = [
  { label: 'GET', value: 'GET' },
  { label: 'POST', value: 'POST' },
  { label: 'PUT', value: 'PUT' },
  { label: 'PATCH', value: 'PATCH' },
  { label: 'DELETE', value: 'DELETE' },
  { label: 'HEAD', value: 'HEAD' },
  { label: 'OPTIONS', value: 'OPTIONS' },
];

const bodyModeOptions = [
  { label: 'Auto', value: 'auto' },
  { label: 'JSON', value: 'json' },
  { label: 'Text', value: 'text' },
  { label: 'Form', value: 'form' },
  { label: 'Multipart', value: 'multipart' },
];

const assertTypeOptions = [
  { label: 'Status equals', value: 'status' },
  { label: 'Header contains', value: 'header' },
  { label: 'JSON path equals', value: 'jsonPath' },
];

const showCreateSession = ref(false);
const showEnvironmentModal = ref(false);
const isSavingSession = ref(false);
const isSending = ref(false);

const requestForm = reactive({
  id: '',
  sessionId: '',
  name: '',
  method: 'GET',
  url: '',
  headersText: '{\n}',
  queryText: '{\n}',
  bodyMode: 'auto' as BodyMode,
  body: '',
  preScripts: '',
  postScripts: '',
});

const sessionForm = reactive({
  id: '',
  name: '',
  description: '',
  baseUrl: '',
});

const environmentForm = reactive({
  id: '' as string | null,
  name: '',
  description: '',
  variables: '{\n}',
});

const assertions = reactive<AssertionState[]>([]);

const response = reactive<ApiExecutionResult & { logs: string[] }>({
  status: 0,
  latencyMs: 0,
  headers: {},
  bodyPath: undefined,
  bodyText: undefined,
  size: undefined,
  captures: {},
  logs: [],
});

const activeEnvironmentId = ref<string | null>(null);
const importInput = ref<HTMLInputElement | null>(null);
const isImporting = ref(false);
const importError = ref('');
const exportMessage = ref('');

const environmentOptions = computed(() => environmentsStore.items.map((item) => ({ label: item.name, value: item.id })));

const formattedHeaders = computed(() => JSON.stringify(response.headers, null, 2));
const formattedBody = computed(() => {
  if (!response.bodyText) return 'No body';
  try {
    return JSON.stringify(JSON.parse(response.bodyText), null, 2);
  } catch {
    return response.bodyText;
  }
});

watch(
  () => apiSessionsStore.activeRequest,
  (request) => {
    if (!request) {
      requestForm.id = '';
      requestForm.sessionId = apiSessionsStore.activeSessionId ?? '';
      requestForm.name = '';
      requestForm.method = 'GET';
      requestForm.url = '';
      requestForm.headersText = '{\n}';
      requestForm.queryText = '{\n}';
      requestForm.bodyMode = 'auto';
      requestForm.body = '';
      requestForm.preScripts = '';
      requestForm.postScripts = '';
      assertions.splice(0, assertions.length);
      return;
    }
    requestForm.id = request.id;
    requestForm.sessionId = request.apiSessionId;
    requestForm.name = request.name;
    requestForm.method = request.method;
    requestForm.url = request.url;
    requestForm.headersText = safeStringify(request.headers ?? {});
    requestForm.queryText = safeStringify(request.query ?? {});
    requestForm.bodyMode = ((request.bodyMode as BodyMode | null) ?? 'auto');
    requestForm.body = request.body ?? '';
    requestForm.preScripts = request.preScripts ?? '';
    requestForm.postScripts = request.postScripts ?? '';
    assertions.splice(0, assertions.length);
    const storedAssertions = Array.isArray((request as any).assertions)
      ? ((request as any).assertions as Array<Record<string, unknown>>)
      : [];
    storedAssertions.forEach((item) => {
      const type = (item.type as AssertionType) ?? 'status';
      let expected: string | number | null = null;
      if (type === 'status') {
        expected = Number((item.value ?? item.expected ?? 200) as number);
      } else {
        expected = String((item.value ?? item.expected ?? '') as string);
      }
      assertions.push({
        id: crypto.randomUUID(),
        type,
        name: (item.name as string | undefined) ?? '',
        path: (item.path as string | undefined) ?? '',
        expected,
      });
    });
  },
  { immediate: true },
);

watch(
  () => apiSessionsStore.activeSessionId,
  (id) => {
    if (!id) return;
    const session = apiSessionsStore.sessions.find((item) => item.id === id);
    if (session?.baseUrl && !requestForm.url) {
      requestForm.url = session.baseUrl;
    }
  },
);

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{\n}';
  }
}

function selectSession(id: string) {
  apiSessionsStore.selectSession(id);
}

function selectRequest(id: string) {
  apiSessionsStore.selectRequest(id);
}

function addAssertion() {
    assertions.push({ id: crypto.randomUUID(), type: 'status', expected: 200 });
}

function removeAssertion(index: number) {
  assertions.splice(index, 1);
}

function setAssertionType(index: number, type: AssertionType) {
  const target = assertions[index];
  if (!target) return;
  target.type = type;
  if (type === 'status') {
    target.expected = typeof target.expected === 'number' ? target.expected : 200;
    target.name = '';
    target.path = '';
  } else if (type === 'header') {
    target.name = target.name ?? '';
    target.expected = typeof target.expected === 'string' ? target.expected : '';
    target.path = '';
  } else {
    target.path = target.path ?? '';
    target.expected = typeof target.expected === 'string' ? target.expected : '';
    target.name = '';
  }
}

function updateAssertion(index: number, patch: Partial<AssertionState>) {
  const target = assertions[index];
  if (!target) return;
  Object.assign(target, patch);
}

function parseJson(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('Invalid JSON');
  }
}

async function saveSession() {
  if (!sessionForm.name.trim()) return;
  isSavingSession.value = true;
  try {
    await apiSessionsStore.saveSession({
      id: sessionForm.id || undefined,
      name: sessionForm.name,
      description: sessionForm.description,
      baseUrl: sessionForm.baseUrl,
    });
    showCreateSession.value = false;
    sessionForm.id = '';
    sessionForm.name = '';
    sessionForm.description = '';
    sessionForm.baseUrl = '';
  } finally {
    isSavingSession.value = false;
  }
}

function createRequest(sessionId: string) {
  apiSessionsStore.selectSession(sessionId);
  apiSessionsStore.selectRequest(null);
  requestForm.sessionId = sessionId;
  requestForm.method = 'GET';
  requestForm.url = '';
  requestForm.headersText = '{\n}';
  requestForm.queryText = '{\n}';
  requestForm.bodyMode = 'auto';
  requestForm.body = '';
  assertions.splice(0, assertions.length);
}

function formatJson(target: 'headers' | 'query') {
  try {
    if (target === 'headers') {
      const parsed = parseJson(requestForm.headersText);
      requestForm.headersText = JSON.stringify(parsed, null, 2);
    } else {
      const parsed = parseJson(requestForm.queryText);
      requestForm.queryText = JSON.stringify(parsed, null, 2);
    }
  } catch (error) {
    console.warn('Failed to format JSON', error);
  }
}

async function saveRequest() {
  if (!apiSessionsStore.activeSessionId) return;
  const headers = parseJson(requestForm.headersText);
  const query = parseJson(requestForm.queryText);
  await apiSessionsStore.saveRequest({
    id: requestForm.id || undefined,
    apiSessionId: apiSessionsStore.activeSessionId,
    name: requestForm.name || requestForm.url || requestForm.method,
    method: requestForm.method,
    url: requestForm.url,
    headers,
    query,
    bodyMode: requestForm.bodyMode === 'auto' ? null : requestForm.bodyMode,
    body: requestForm.body,
    preScripts: requestForm.preScripts,
    postScripts: requestForm.postScripts,
    assertions: assertions.map((item) =>
      item.type === 'status'
        ? { type: 'status', operator: 'equals', value: Number(item.expected ?? 200) }
        : item.type === 'header'
          ? { type: 'header', name: item.name ?? '', operator: 'contains', value: String(item.expected ?? '') }
          : { type: 'jsonPath', path: item.path ?? '', operator: 'equals', value: item.expected ?? '' },
    ),
  });
}

async function sendRequest() {
  if (!requestForm.id) {
    await saveRequest();
  }
  if (!requestForm.id) return;
  isSending.value = true;
  try {
    const result = (await apiSessionsStore.sendRequest({
      apiRequestId: requestForm.id,
      environmentId: activeEnvironmentId.value ?? undefined,
    })) as ApiExecutionResult & { logs?: string[] };
    response.status = result.status;
    response.latencyMs = result.latencyMs;
    response.headers = result.headers;
    response.bodyPath = result.bodyPath;
    response.bodyText = result.bodyText;
    response.size = result.size;
    response.captures = result.captures ?? {};
    response.logs = result.logs ?? [];
    if (result.errorMessage) {
      response.logs.push(`Assertion failed: ${result.errorMessage}`);
    }
  } finally {
    isSending.value = false;
  }
}

async function saveAsBlock() {
  await saveRequest();
  if (!requestForm.id) return;
  const headers = parseJson(requestForm.headersText);
  const query = parseJson(requestForm.queryText);
    const blockPayload = {
      title: requestForm.name || `${requestForm.method} ${requestForm.url}`,
      description: `Generated from request ${requestForm.id}`,
      actions: [
      {
        method: requestForm.method,
        url: requestForm.url,
        headers,
        query,
        bodyMode: requestForm.bodyMode === 'auto' ? null : requestForm.bodyMode,
        body: requestForm.body,
        assertions: assertions.map((item) =>
          item.type === 'status'
            ? { type: 'status', operator: 'equals', value: Number(item.expected ?? 200) }
            : item.type === 'header'
              ? { type: 'header', name: item.name ?? '', operator: 'contains', value: String(item.expected ?? '') }
              : { type: 'jsonPath', path: item.path ?? '', operator: 'equals', value: item.expected },
        ),
      },
    ],
    params: [],
  };
  await apiBlocksStore.saveBlock(blockPayload);
}

function openArtifact(path: string) {
  void window.api.invoke('runner.openArtifact', { path });
}

function editEnvironment(env: { id: string; name: string; description?: string | null; variables: Record<string, unknown> }) {
  environmentForm.id = env.id;
  environmentForm.name = env.name;
  environmentForm.description = env.description ?? '';
  environmentForm.variables = safeStringify(env.variables ?? {});
}

function resetEnvironmentForm() {
  environmentForm.id = null;
  environmentForm.name = '';
  environmentForm.description = '';
  environmentForm.variables = '{\n}';
}

async function saveEnvironment() {
  try {
    const vars = parseJson(environmentForm.variables);
    await environmentsStore.saveEnvironment({
      id: environmentForm.id ?? undefined,
      name: environmentForm.name,
      description: environmentForm.description,
      variables: vars,
    });
    resetEnvironmentForm();
    await environmentsStore.fetchEnvironments();
  } catch (error) {
    console.warn('Failed to save environment', error);
  }
}

async function removeEnvironment(id: string) {
  await environmentsStore.deleteEnvironment(id);
  if (activeEnvironmentId.value === id) {
    activeEnvironmentId.value = null;
  }
}

function triggerImport() {
  importError.value = '';
  importInput.value?.click();
}

async function onImportFile(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = '';
  if (!file) return;
  isImporting.value = true;
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    await window.api.invoke('api.session.import', json);
    await apiSessionsStore.fetchSessions();
    await apiBlocksStore.fetchBlocks();
    importError.value = '';
  } catch (error) {
    importError.value = error instanceof Error ? error.message : 'Failed to import collections';
  } finally {
    isImporting.value = false;
  }
}

async function exportCollections() {
  exportMessage.value = '';
  try {
    const result = (await window.api.invoke('api.session.export', {})) as { filePath?: string };
    exportMessage.value = result?.filePath ?? '';
    importError.value = '';
  } catch (error) {
    importError.value = error instanceof Error ? error.message : 'Failed to export collections';
  }
}

watch(
  () => showEnvironmentModal.value,
  (open) => {
    if (open) {
      void environmentsStore.fetchEnvironments();
    }
  },
);

watch(
  () => showCreateSession.value,
  (open) => {
    if (!open) return;
    sessionForm.id = '';
    sessionForm.name = '';
    sessionForm.description = '';
    sessionForm.baseUrl = '';
  },
);

void apiSessionsStore.fetchSessions();
void environmentsStore.fetchEnvironments();
void apiBlocksStore.fetchBlocks();
</script>
