import { ipcMain } from 'electron';
import { z } from 'zod';
import type { Expectation as SharedExpectation, RunnerAttachment, RunSummaryDetail, Step } from '@shared/types';
import {
  listRecordings,
  listBlocks,
  getBlock,
  createBlock,
  updateBlock,
  listTests,
  createTest,
  updateTest,
  listDatasets,
  upsertDataset,
  listTags,
  listApiSessions,
  getApiSessionById,
  createApiSession,
  updateApiSession,
  createApiRequest,
  updateApiRequest,
  getApiRequestById,
  recordApiRequestExecution,
  listApiBlocks,
  getApiBlock,
  createApiBlock,
  updateApiBlock,
  listEnvironments,
  upsertEnvironment,
  deleteEnvironment,
  deleteApiRequest,
  deleteApiSession,
  getEnvironmentById,
} from './db/repositories';
import type {
  ApiBlockInput,
  ApiBlockPatch,
  ApiRequestExecutionSnapshot,
  ApiRequestInput,
  ApiSessionInput,
  ApiSessionPatch,
  BlockInput,
  BlockPatch,
  DataSetInput,
  EnvironmentInput,
  TestInput,
} from './db/repositories';
import { composeTestCase } from './services/testComposer';
import { startRun, stopRun } from './services/runManager';
import { listRunResults } from './db/repositories';
import { shell } from 'electron';
import { access, readFile, writeFile, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, basename, normalize } from 'node:path';
import { request as playwrightRequest, expect as playwrightExpect } from '@playwright/test';
import { Prisma } from '@prisma/client';
import { executeApiActions } from '@shared/runtime/api';
import { startRecording as launchRecorder, type RecorderHandle } from './runners/recorder';
import { ingestRecorderArtifacts } from './services/recordingIngest';

interface RecorderSession {
  handle: RecorderHandle;
  options: {
    baseUrl: string;
    viewport: { width: number; height: number; deviceScaleFactor?: number };
  };
}

const activeRecorders = new Map<string, RecorderSession>();
import { aiService } from './ai/service';
import { LlmDisabledError, LlmRequestError } from './ai/errors';

const blockParamSchema = z.object({
  name: z.string(),
  label: z.string().optional(),
  type: z.enum(['string', 'number', 'boolean', 'enum', 'secret']).default('string'),
  required: z.boolean().default(true),
  defaultValue: z.string().optional(),
  enumValues: z.string().optional(),
});

const blockCreateSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  includeScreenshots: z.boolean().optional(),
  params: z.array(blockParamSchema).default([]),
  block: z.any(),
  tagNames: z.array(z.string()).optional(),
});

const blockUpdateSchema = z.object({
  blockId: z.string(),
  patch: z.object({
    title: z.string().optional(),
    description: z.string().nullable().optional(),
    block: z.any().optional(),
    params: z.array(blockParamSchema).optional(),
    tagNames: z.array(z.string()).optional(),
  }),
});

const composeTestSchema = z.object({
  testId: z.string().optional(),
  title: z.string().min(1),
  blocks: z.array(
    z.object({
      kind: z.enum(['ui', 'api']).default('ui'),
      blockId: z.string(),
      version: z.number().int().nonnegative(),
      bindings: z.record(z.string(), z.any()),
      expectations: z
        .array(
          z.object({
            id: z.string(),
            type: z.literal('assert'),
            operator: z.enum(['equals', 'contains', 'exists', 'notExists']),
            selector: z.string(),
            value: z.string().optional(),
          }),
        )
        .optional(),
    }),
  ),
  baseUrl: z.string().url(),
  viewport: z.object({ width: z.number().int(), height: z.number().int(), scale: z.number().optional() }),
  tagNames: z.array(z.string()).optional(),
  datasetId: z.string().optional(),
  environmentId: z.string().optional(),
});

const datasetUpsertSchema = z.object({
  datasetId: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  bindings: z.record(z.string(), z.any()),
  tagNames: z.array(z.string()).optional(),
});

const runStartSchema = z.object({
  testIds: z.array(z.string()).min(1),
  headed: z.boolean().optional(),
  workers: z.number().int().min(1).max(8).optional(),
});

const recordingViewportSchema = z.object({
  width: z.number().int().positive().default(1366),
  height: z.number().int().positive().default(900),
  deviceScaleFactor: z.number().positive().optional(),
});

const recordingStartSchema = z
  .object({
    baseUrl: z.string().optional(),
    viewport: recordingViewportSchema.optional(),
  })
  .optional();

const recordingStopSchema = z.object({ sessionId: z.string() });
const recordingScreenshotSchema = z.object({ path: z.string().min(1) });

const stepSchema = z.object({
  id: z.string(),
  recordingId: z.string().optional(),
  index: z.number().int(),
  type: z.enum(['route', 'click', 'submit', 'type', 'assert']),
  route: z.string().nullable().optional(),
  selector: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  testid: z.string().nullable().optional(),
  apiHints: z.any().nullable().optional(),
  screenshot: z.string().optional(),
  customName: z.string().nullable().optional(),
  deleted: z.boolean().optional(),
  paramHints: z.any().nullable().optional(),
});

const expectationSchema = z.object({
  id: z.string(),
  type: z.literal('assert'),
  operator: z.enum(['equals', 'contains', 'exists', 'notExists']),
  selector: z.string(),
  value: z.string().optional(),
});

const aiSettingsUpdateSchema = z
  .object({
    baseUrl: z.string().url().optional(),
    model: z.string().min(1).optional(),
    temperature: z.number().optional(),
    topP: z.number().optional(),
    maxTokens: z.number().optional(),
    enableCache: z.boolean().optional(),
  })
  .strict();

function toAiErrorPayload(error: unknown) {
  if (error instanceof LlmDisabledError || error instanceof LlmRequestError) {
    return { error: error.code, message: error.message };
  }
  return null;
}

ipcMain.handle('system:ping', async (_event, payload) => {
  const schema = z.object({ message: z.string() });
  const data = schema.parse(payload);
  return { reply: `pong:${data.message}` };
});

ipcMain.handle('recording.list', async () => {
  const items = await listRecordings();
  return { items };
});

ipcMain.handle('recording.start', async (_event, payload) => {
  const parsed = recordingStartSchema.parse(payload ?? {});
  const data = parsed ?? {};
  const viewport = data.viewport ?? { width: 1366, height: 900 };
  const baseUrl = data.baseUrl ?? '';
  try {
    const recorder = await launchRecorder({
      baseUrl,
      viewport,
    });
    activeRecorders.set(recorder.sessionId, {
      handle: recorder,
      options: { baseUrl, viewport },
    });
    recorder.context.on('close', () => {
      activeRecorders.delete(recorder.sessionId);
    });
    return {
      sessionId: recorder.sessionId,
      tracePath: recorder.tracePath,
      flowLogPath: recorder.flowLogPath,
    };
  } catch (error) {
    console.error('Failed to start recording session', error);
    throw error;
  }
});

ipcMain.handle('recording.stop', async (_event, payload) => {
  const { sessionId } = recordingStopSchema.parse(payload);
  const session = activeRecorders.get(sessionId);
  if (!session) {
    return { sessionId, stopped: false };
  }
  try {
    await session.handle.stop();
    const recording = await ingestRecorderArtifacts({
      sessionId,
      tracePath: session.handle.tracePath,
      flowLogPath: session.handle.flowLogPath,
      artifactsDir: session.handle.artifactsDir,
      baseUrl: session.options.baseUrl,
      viewport: session.options.viewport,
    });
    return {
      sessionId,
      stopped: true,
      tracePath: session.handle.tracePath,
      flowLogPath: session.handle.flowLogPath,
      recordingId: recording.id,
    };
  } catch (error) {
    console.error('Failed to stop recording session', error);
    throw error;
  } finally {
    activeRecorders.delete(sessionId);
  }
});

ipcMain.handle('recording.screenshot', async (_event, payload) => {
  const { path } = recordingScreenshotSchema.parse(payload);
  const dataRoot = join(process.cwd(), 'data');
  const normalizedPath = normalize(path);
  const absolute = join(dataRoot, normalizedPath);

  if (!absolute.startsWith(dataRoot)) {
    throw new Error('Invalid screenshot path');
  }

  const buffer = await readFile(absolute);
  const ext = basename(absolute).split('.').pop()?.toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${buffer.toString('base64')}`;
});

ipcMain.handle('block.list', async (_event, payload) => {
  const schema = z.object({ tagNames: z.array(z.string()).optional() }).optional();
  const data = schema.parse(payload) ?? {};
  const items = await listBlocks(data.tagNames);
  return { items };
});

ipcMain.handle('block.get', async (_event, payload) => {
  const schema = z.object({ blockId: z.string(), version: z.number().optional() });
  const data = schema.parse(payload);
  const block = await getBlock(data.blockId, data.version);
  return { block };
});

ipcMain.handle('block.create', async (_event, payload) => {
  const data = blockCreateSchema.parse(payload);
  const blockInput: BlockInput = {
    id: data.id,
    title: data.title,
    description: data.description,
    block: data.block,
    params: data.params.map((param) => ({
      name: param.name,
      label: param.label,
      type: param.type,
      required: param.required,
      defaultValue: param.defaultValue,
      enumValues: param.enumValues,
    })),
    tagNames: data.tagNames,
  };
  const block = await createBlock(blockInput);
  return { block };
});

ipcMain.handle('block.update', async (_event, payload) => {
  const data = blockUpdateSchema.parse(payload);
  const patch: BlockPatch = {
    title: data.patch.title ?? undefined,
    description: data.patch.description ?? undefined,
    block: data.patch.block,
    params: data.patch.params?.map((param) => ({
      name: param.name,
      label: param.label,
      type: param.type,
      required: param.required,
      defaultValue: param.defaultValue,
      enumValues: param.enumValues,
    })),
    tagNames: data.patch.tagNames,
  };
  const block = await updateBlock(data.blockId, patch);
  return { block };
});

const apiSessionSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  baseUrl: z.string().url().nullable().optional(),
  tagNames: z.array(z.string()).optional(),
});

const apiRequestSchema = z.object({
  id: z.string().optional(),
  apiSessionId: z.string().min(1),
  name: z.string().min(1),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
  url: z.string().min(1),
  headers: z.record(z.string(), z.any()).optional(),
  query: z.record(z.string(), z.any()).optional(),
  bodyMode: z.enum(['json', 'text', 'form', 'multipart']).nullable().optional(),
  body: z.string().nullable().optional(),
  auth: z.record(z.string(), z.any()).optional(),
  preScripts: z.string().nullable().optional(),
  postScripts: z.string().nullable().optional(),
  assertions: z.array(z.any()).optional(),
});

const apiBlockSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  actions: z.array(z.any()),
  params: z.array(blockParamSchema).default([]),
  tagNames: z.array(z.string()).optional(),
});

const environmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  variables: z.record(z.string(), z.any()),
});

ipcMain.handle('api.session.list', async (_event, payload) => {
  const schema = z.object({ tagNames: z.array(z.string()).optional() }).optional();
  const data = schema.parse(payload) ?? {};
  const items = await listApiSessions(data.tagNames);
  return { items };
});

ipcMain.handle('api.session.save', async (_event, payload) => {
  const data = apiSessionSchema.parse(payload);
  if (data.id) {
    const session = await updateApiSession(data.id, {
      name: data.name,
      description: data.description ?? undefined,
      baseUrl: data.baseUrl ?? undefined,
      tagNames: data.tagNames,
    } satisfies ApiSessionPatch);
    return { sessionId: session.id };
  }
  const session = await createApiSession({
    name: data.name,
    description: data.description ?? undefined,
    baseUrl: data.baseUrl ?? undefined,
    tagNames: data.tagNames,
  } satisfies ApiSessionInput);
  return { sessionId: session.id };
});

ipcMain.handle('api.session.delete', async (_event, payload) => {
  const schema = z.object({ sessionId: z.string() });
  const data = schema.parse(payload);
  await deleteApiSession(data.sessionId);
  return { sessionId: data.sessionId };
});

ipcMain.handle('api.request.save', async (_event, payload) => {
  const data = apiRequestSchema.parse(payload);
  if (data.id) {
    await updateApiRequest(data.id, {
      apiSessionId: data.apiSessionId,
      name: data.name,
      method: data.method,
      url: data.url,
      headers: data.headers,
      query: data.query,
      bodyMode: data.bodyMode,
      body: data.body ?? null,
      auth: data.auth,
      preScripts: data.preScripts ?? null,
      postScripts: data.postScripts ?? null,
      assertions: data.assertions,
    } satisfies ApiRequestInput);
    return { apiRequestId: data.id };
  }
  const created = await createApiRequest({
    apiSessionId: data.apiSessionId,
    name: data.name,
    method: data.method,
    url: data.url,
    headers: data.headers,
    query: data.query,
    bodyMode: data.bodyMode,
    body: data.body ?? null,
    auth: data.auth,
    preScripts: data.preScripts ?? null,
    postScripts: data.postScripts ?? null,
    assertions: data.assertions,
  });
  return { apiRequestId: created.id };
});

ipcMain.handle('api.request.delete', async (_event, payload) => {
  const schema = z.object({ apiRequestId: z.string() });
  const data = schema.parse(payload);
  await deleteApiRequest(data.apiRequestId);
  return { apiRequestId: data.apiRequestId };
});

ipcMain.handle('api.request.send', async (_event, payload) => {
  const schema = z.object({
    apiRequestId: z.string(),
    environmentId: z.string().optional(),
    bindings: z.record(z.string(), z.any()).optional(),
  });
  const data = schema.parse(payload);
  const requestRecord = await getApiRequestById(data.apiRequestId);
  if (!requestRecord) {
    throw new Error(`API request ${data.apiRequestId} not found`);
  }
  const session = await getApiSessionById(requestRecord.apiSessionId);
  const environment = data.environmentId ? await getEnvironmentById(data.environmentId) : undefined;
  const params: Record<string, unknown> = {
    ...(environment?.variables as Record<string, unknown> | undefined),
    ...(data.bindings ?? {}),
  };

  const action = {
    method: requestRecord.method,
    url: requestRecord.url,
    headers: requestRecord.headers as Record<string, unknown> | null,
    query: requestRecord.query as Record<string, unknown> | null,
    bodyMode: requestRecord.bodyMode ?? null,
    body: requestRecord.body,
    auth: requestRecord.auth as Record<string, unknown> | null,
    assertions: Array.isArray(requestRecord.assertions) ? (requestRecord.assertions as Record<string, unknown>[]) : undefined,
    preScript: requestRecord.preScripts ?? undefined,
    postScript: requestRecord.postScripts ?? undefined,
  };

  const apiContext = await playwrightRequest.newContext({ baseURL: session?.baseUrl ?? undefined });
  let execution: Awaited<ReturnType<typeof executeApiActions>> = { captures: {}, logs: [] };
  let errorMessage: string | undefined;
  try {
    execution = await executeApiActions([action], {
      request: apiContext,
      expect: playwrightExpect,
      params,
      ctx: {},
    });
  } catch (error) {
    errorMessage = (error as Error).message;
  } finally {
    await apiContext.dispose();
  }

  const log = execution.logs.length ? execution.logs[execution.logs.length - 1] : undefined;
  const response = log?.response;
  const status = response?.status ?? 0;
  const latencyMs = response?.latencyMs ?? 0;
  const headers = response?.headers ?? {};
  const rawBody = response?.rawBodyText ?? '';
  let bodyPath: string | undefined;
  if (rawBody.length > 200000) {
    const dir = join(process.cwd(), 'data', 'responses');
    await mkdir(dir, { recursive: true });
    bodyPath = join(dir, `${data.apiRequestId}-${Date.now()}.txt`);
    await writeFile(bodyPath, rawBody, 'utf8');
  }

  await recordApiRequestExecution(data.apiRequestId, {
    status,
    latencyMs,
    responseHeaders: headers,
    responseBody: bodyPath ? `@file:${bodyPath}` : rawBody,
  } satisfies ApiRequestExecutionSnapshot);

  return {
    status,
    latencyMs,
    headers,
    bodyText: bodyPath ? undefined : rawBody,
    bodyPath,
    size: rawBody.length,
    captures: execution.captures,
    logs: execution.logs.map((item) => JSON.stringify(item, null, 2)),
    errorMessage: errorMessage ?? execution.error?.message,
  };
});

ipcMain.handle('api.block.list', async (_event, payload) => {
  const schema = z.object({ tagNames: z.array(z.string()).optional() }).optional();
  const data = schema.parse(payload) ?? {};
  const items = await listApiBlocks(data.tagNames);
  return { items };
});

ipcMain.handle('api.block.save', async (_event, payload) => {
  const data = apiBlockSchema.parse(payload);
  if (data.id) {
    const block = await updateApiBlock(data.id, {
      title: data.title,
      description: data.description ?? undefined,
      actions: data.actions,
      params: data.params.map((param) => ({
        name: param.name,
        label: param.label,
        type: param.type,
        required: param.required,
        defaultValue: param.defaultValue,
        enumValues: param.enumValues,
      })),
      tagNames: data.tagNames,
    } satisfies ApiBlockPatch);
    return { apiBlockId: block.id, version: block.version };
  }
  const block = await createApiBlock({
    title: data.title,
    description: data.description ?? undefined,
    actions: data.actions,
    params: data.params.map((param) => ({
      name: param.name,
      label: param.label,
      type: param.type,
      required: param.required,
      defaultValue: param.defaultValue,
      enumValues: param.enumValues,
    })),
    tagNames: data.tagNames,
  } satisfies ApiBlockInput);
  return { apiBlockId: block.id, version: block.version };
});

ipcMain.handle('api.session.export', async () => {
  const sessions = await listApiSessions();
  const blocks = await listApiBlocks();
  const payload = {
    exportedAt: new Date().toISOString(),
    sessions,
    blocks,
  };
  const dir = join(process.cwd(), 'data', 'exports');
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `api-collections-${Date.now()}.json`);
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return { filePath };
});

ipcMain.handle('api.session.import', async (_event, payload) => {
  const schema = z.object({
    sessions: z.array(z.any()).optional(),
    blocks: z.array(z.any()).optional(),
  });

  let sessionBundles: Array<{ session: ApiSessionInput; requests: Array<ApiRequestInput> }> = [];
  let importedBlocks: ApiBlockInput[] = [];

  if (payload && typeof payload === 'object' && 'info' in payload && Array.isArray((payload as any).item)) {
    const converted = convertPostmanCollection(payload as Record<string, unknown>);
    sessionBundles = converted.sessions;
    importedBlocks = converted.blocks;
  } else if (payload && typeof payload === 'object' && ('openapi' in payload || 'swagger' in payload)) {
    const converted = convertOpenApiDocument(payload as Record<string, unknown>);
    sessionBundles = converted.sessions;
    importedBlocks = converted.blocks;
  } else {
    const data = schema.parse(payload);
    const rawSessions = data.sessions ?? [];
    importedBlocks = (data.blocks as ApiBlockInput[] | undefined) ?? [];
    sessionBundles = rawSessions.map((session: any) => ({
      session: {
        id: session.id,
        name: session.name,
        description: session.description ?? undefined,
        baseUrl: session.baseUrl ?? undefined,
        tagNames: Array.isArray(session.tags) ? session.tags.map((tag: any) => tag.name).filter(Boolean) : undefined,
      },
      requests: Array.isArray(session.requests)
        ? session.requests.map((request: any) => ({
            id: request.id,
            apiSessionId: session.id,
            name: request.name,
            method: request.method,
            url: request.url,
            headers: request.headers,
            query: request.query,
            bodyMode: request.bodyMode ?? null,
            body: request.body ?? null,
            auth: request.auth,
            preScripts: request.preScripts ?? null,
            postScripts: request.postScripts ?? null,
            assertions: request.assertions,
          }))
        : [],
    }));
  }

  for (const block of importedBlocks) {
    await createApiBlock({
      id: block.id,
      title: block.title,
      description: block.description ?? undefined,
      actions: block.actions,
      version: block.version ?? undefined,
      params: Array.isArray(block.params)
        ? block.params.map((param: any) => ({
            id: param.id,
            name: param.name,
            label: param.label,
            type: param.type,
            required: param.required ?? true,
            defaultValue: param.defaultValue ?? null,
            enumValues: param.enumValues ?? null,
          }))
        : [],
      tagNames: Array.isArray((block as any)?.tagNames)
        ? ((block as any).tagNames as string[])
        : undefined,
    } satisfies ApiBlockInput);
  }

  for (const bundle of sessionBundles) {
    const created = await createApiSession(bundle.session);
    for (const request of bundle.requests) {
      await createApiRequest({
        ...request,
        apiSessionId: created.id,
      });
    }
  }

  return { importedSessions: sessionBundles.length, importedBlocks: importedBlocks.length };
});

type SessionBundle = { session: ApiSessionInput; requests: ApiRequestInput[] };

function defaultAssertions(): Prisma.JsonValue {
  return [{ type: 'status', operator: 'between', value: [200, 299] }] as unknown as Prisma.JsonValue;
}

function stringifyPostmanUrl(raw: any): { url: string; query?: Record<string, string> } {
  if (typeof raw === 'string') {
    const [base, search] = raw.split('?');
    const query: Record<string, string> = {};
    if (search) {
      search.split('&').forEach((pair) => {
        const [key, value] = pair.split('=');
        if (key) query[key] = value ?? '';
      });
    }
    return { url: base, query: Object.keys(query).length ? query : undefined };
  }
  if (raw?.raw) {
    return stringifyPostmanUrl(raw.raw);
  }
  const protocol = typeof raw?.protocol === 'string' ? `${raw.protocol}://` : '';
  const host = Array.isArray(raw?.host) ? raw.host.join('.') : raw?.host ?? '';
  const pathSegments = Array.isArray(raw?.path) ? raw.path : raw?.path ? [raw.path] : [];
  const path = pathSegments.filter(Boolean).join('/');
  const queryEntries = Array.isArray(raw?.query) ? raw.query : [];
  const query: Record<string, string> = {};
  for (const entry of queryEntries) {
    if (!entry?.key) continue;
    query[entry.key] = entry.value ?? '';
  }
  const url = `${protocol}${host}${path ? `/${path}` : ''}`;
  return { url, query: Object.keys(query).length ? query : undefined };
}

function splitUrl(url: string): { baseUrl?: string; path: string } {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname + (parsed.search ?? '');
    return { baseUrl: `${parsed.protocol}//${parsed.host}`, path: path || '/' };
  } catch {
    return { baseUrl: undefined, path: url };
  }
}

function convertPostmanCollection(collection: Record<string, unknown>): { sessions: SessionBundle[]; blocks: ApiBlockInput[] } {
  const items = Array.isArray(collection.item) ? (collection.item as Array<Record<string, unknown>>) : [];
  const flattened: Array<{ request: ApiRequestInput; block: ApiBlockInput; fullUrl?: string }> = [];

  function walk(nodes: Array<Record<string, unknown>>) {
    for (const node of nodes) {
      if (Array.isArray(node.item)) {
        walk(node.item as Array<Record<string, unknown>>);
        continue;
      }
      if (!node.request) continue;
      const request = node.request as Record<string, any>;
      const name = String(node.name ?? request.url ?? 'Request');
      const { url: rawUrl, query } = stringifyPostmanUrl(request.url);
      const { baseUrl, path } = splitUrl(rawUrl);
      const headersArray = Array.isArray(request.header) ? request.header : [];
      const headers: Record<string, string> = {};
      headersArray.forEach((header: any) => {
        if (header?.key) headers[header.key] = header.value ?? '';
      });
      const body = request.body;
      let bodyMode: string | null = null;
      let bodyValue: string | null = null;
      if (body?.mode === 'raw') {
        bodyMode = body?.options?.raw?.language === 'json' ? 'json' : 'text';
        bodyValue = body.raw ?? null;
      } else if (body?.mode === 'urlencoded') {
        bodyMode = 'form';
        const formEntries = Array.isArray(body.urlencoded) ? body.urlencoded : [];
        const encoded: Record<string, string> = {};
        formEntries.forEach((entry: any) => {
          if (entry?.key) encoded[entry.key] = entry.value ?? '';
        });
        bodyValue = JSON.stringify(encoded);
      } else if (body?.mode === 'formdata') {
        bodyMode = 'multipart';
      }

      const headersJson = Object.keys(headers).length ? (headers as unknown as Prisma.JsonValue) : undefined;
      const queryJson = query ? (query as unknown as Prisma.JsonValue) : undefined;
      const requestInput: ApiRequestInput = {
        id: typeof node.id === 'string' ? (node.id as string) : undefined,
        apiSessionId: '',
        name,
        method: String(request.method ?? 'GET'),
        url: path,
        headers: headersJson,
        query: queryJson,
        bodyMode,
        body: bodyValue,
        auth: request.auth ?? undefined,
        preScripts: undefined,
        postScripts: undefined,
        assertions: defaultAssertions(),
      } satisfies ApiRequestInput;

      const actionJson = {
        method: requestInput.method,
        url: path,
        headers: headers,
        query,
        bodyMode,
        body: bodyValue,
        assertions: defaultAssertions(),
      };

      const block: ApiBlockInput = {
        title: name,
        description: 'Imported from Postman collection',
        actions: actionJson as unknown as Prisma.JsonValue,
        params: [],
      };

      flattened.push({ request: requestInput, block, fullUrl: baseUrl ? `${baseUrl}${path}` : rawUrl });
    }
  }

  walk(items);

  let sessionBaseUrl: string | undefined;
  for (const entry of flattened) {
    if (!entry.fullUrl) continue;
    const split = splitUrl(entry.fullUrl);
    if (split.baseUrl) {
      sessionBaseUrl = split.baseUrl;
      break;
    }
  }

  const session: ApiSessionInput = {
    name: String((collection.info as any)?.name ?? 'Imported Collection'),
    description: (collection.info as any)?.description ?? undefined,
    baseUrl: sessionBaseUrl,
  } satisfies ApiSessionInput;

  const requests = flattened.map((entry) => entry.request);
  const blocks = flattened.map((entry) => entry.block);

  return {
    sessions: [{ session, requests }],
    blocks,
  };
}

function convertOpenApiDocument(doc: Record<string, unknown>): { sessions: SessionBundle[]; blocks: ApiBlockInput[] } {
  const title = String(((doc.info as any)?.title ?? 'OpenAPI') ?? 'OpenAPI');
  const serverUrl = Array.isArray(doc.servers) && doc.servers.length ? (doc.servers[0] as any).url : undefined;
  const session: ApiSessionInput = {
    name: `${title} API`,
    baseUrl: typeof serverUrl === 'string' ? serverUrl : undefined,
  } satisfies ApiSessionInput;

  const requests: ApiRequestInput[] = [];
  const blocks: ApiBlockInput[] = [];
  const paths = doc.paths as Record<string, any> | undefined;
  if (paths) {
    for (const [pathKey, methods] of Object.entries(paths)) {
      for (const [methodName, operation] of Object.entries(methods as Record<string, any>)) {
        const method = methodName.toUpperCase();
        const summary = String(
          (operation as any)?.summary ?? (operation as any)?.operationId ?? `${method} ${pathKey}`,
        );
        let bodyMode: string | null = null;
        if (operation?.requestBody?.content) {
          const content = operation.requestBody.content;
          if (content['application/json']) {
            bodyMode = 'json';
          } else if (content['application/x-www-form-urlencoded']) {
            bodyMode = 'form';
          }
        }

        const request: ApiRequestInput = {
          apiSessionId: '',
          name: summary,
          method,
          url: pathKey,
          bodyMode,
          assertions: defaultAssertions(),
        } as ApiRequestInput;

        requests.push(request);
        blocks.push({
          title: summary,
          description: 'Imported from OpenAPI specification',
          actions: (
            [
              {
                method,
                url: pathKey,
                bodyMode,
                assertions: defaultAssertions(),
              },
            ]
          ) as unknown as Prisma.JsonValue,
          params: [],
        });
      }
    }
  }

  return {
    sessions: [{ session, requests }],
    blocks,
  };
}

ipcMain.handle('env.list', async () => {
  const items = await listEnvironments();
  return { items };
});

ipcMain.handle('env.upsert', async (_event, payload) => {
  const data = environmentSchema.parse(payload);
  const environment = await upsertEnvironment({
    id: data.id,
    name: data.name,
    description: data.description ?? undefined,
    variables: data.variables,
  } satisfies EnvironmentInput);
  return { environmentId: environment.id };
});

ipcMain.handle('env.delete', async (_event, payload) => {
  const schema = z.object({ environmentId: z.string() });
  const data = schema.parse(payload);
  await deleteEnvironment(data.environmentId);
  return { environmentId: data.environmentId };
});

ipcMain.handle('ai.settings.get', async () => {
  await aiService.init();
  return { settings: aiService.getSettingsState() };
});

ipcMain.handle('ai.settings.update', async (_event, payload) => {
  const data = aiSettingsUpdateSchema.parse(payload ?? {});
  const state = await aiService.updateSettings(data);
  return { settings: state };
});

ipcMain.handle('ai.settings.setKey', async (_event, payload) => {
  const schema = z.object({ apiKey: z.string().min(1) });
  const data = schema.parse(payload);
  const state = await aiService.setApiKey(data.apiKey);
  return { settings: state };
});

ipcMain.handle('ai.settings.clearKey', async () => {
  const state = await aiService.clearApiKey();
  return { settings: state };
});

ipcMain.handle('ai.settings.test', async () => {
  try {
    await aiService.testConnection();
    return { ok: true };
  } catch (error) {
    const aiError = toAiErrorPayload(error);
    if (aiError) return { ok: false, ...aiError };
    throw error;
  }
});

ipcMain.handle('ai.selectorRepair', async (_event, payload) => {
  const schema = z.object({
    step: stepSchema,
    context: z
      .object({
        preceding: z.array(stepSchema).optional(),
        following: z.array(stepSchema).optional(),
      })
      .optional(),
  });
  const data = schema.parse(payload);
  try {
    const suggestions = await aiService.selectorRepair(data.step as Step, data.context as { preceding?: Step[]; following?: Step[] } | undefined);
    return { suggestions };
  } catch (error) {
    const aiError = toAiErrorPayload(error);
    if (aiError) return aiError;
    throw error;
  }
});

ipcMain.handle('ai.stepSummaries', async (_event, payload) => {
  const schema = z.object({ steps: z.array(stepSchema) });
  const data = schema.parse(payload);
  try {
    const steps = await aiService.summarizeSteps(data.steps as Step[]);
    return { steps };
  } catch (error) {
    const aiError = toAiErrorPayload(error);
    if (aiError) return aiError;
    throw error;
  }
});

ipcMain.handle('ai.tagSuggest', async (_event, payload) => {
  const schema = z.object({
    name: z.string().min(1),
    description: z.string().nullable().optional(),
    type: z.enum(['recording', 'block', 'test', 'api']),
    existingTags: z.array(z.string()).optional(),
    stepSamples: z.array(stepSchema).optional(),
  });
  const data = schema.parse(payload);
  try {
    const suggestions = await aiService.suggestTags({
      name: data.name,
      description: data.description,
      type: data.type,
      existingTags: data.existingTags,
      stepSamples: data.stepSamples as Step[] | undefined,
    });
    return { suggestions };
  } catch (error) {
    const aiError = toAiErrorPayload(error);
    if (aiError) return aiError;
    throw error;
  }
});

ipcMain.handle('ai.assertSuggest', async (_event, payload) => {
  const schema = z.object({
    steps: z.array(stepSchema),
    expectations: z.array(expectationSchema).optional(),
  });
  const data = schema.parse(payload);
  try {
    const assertions = await aiService.suggestAssertions({
      steps: data.steps as Step[],
      expectations: data.expectations as SharedExpectation[] | undefined,
    });
    return { assertions };
  } catch (error) {
    const aiError = toAiErrorPayload(error);
    if (aiError) return aiError;
    throw error;
  }
});

ipcMain.handle('ai.nlToComposition', async (_event, payload) => {
  const schema = z.object({
    instructions: z.string().min(5),
    availableBlocks: z
      .array(
        z.object({
          id: z.string(),
          title: z.string(),
          kind: z.enum(['ui', 'api']),
          params: z.array(z.string()).default([]),
        }),
      )
      .default([]),
    baseUrl: z.string().optional(),
  });
  const data = schema.parse(payload ?? {});
  try {
    const composition = await aiService.naturalLanguageToComposition({
      instructions: data.instructions,
      availableBlocks: data.availableBlocks as Array<{ id: string; title: string; kind: 'ui' | 'api'; params: string[] }>,
      baseUrl: data.baseUrl,
    });
    return { composition };
  } catch (error) {
    const aiError = toAiErrorPayload(error);
    if (aiError) return aiError;
    throw error;
  }
});

ipcMain.handle('ai.failureTriage', async (_event, payload) => {
  const schema = z.object({
    summary: z.array(
      z.object({
        title: z.string(),
        status: z.string(),
        duration: z.number().optional(),
        error: z.string().optional(),
        attachments: z.any().optional(),
      }),
    ),
    logs: z.string().optional(),
  });
  const data = schema.parse(payload);
  try {
    const triage = await aiService.failureTriage({ summary: data.summary as RunSummaryDetail[], logs: data.logs });
    return { triage };
  } catch (error) {
    const aiError = toAiErrorPayload(error);
    if (aiError) return aiError;
    throw error;
  }
});

ipcMain.handle('ai.visualTriage', async (_event, payload) => {
  const schema = z.object({
    diffPath: z.string().min(1),
    metadata: z.record(z.string(), z.any()).optional(),
  });
  const data = schema.parse(payload);
  try {
    const classification = await aiService.classifyVisualDiff({ diffPath: data.diffPath, metadata: data.metadata });
    return { classification };
  } catch (error) {
    const aiError = toAiErrorPayload(error);
    if (aiError) return aiError;
    throw error;
  }
});

ipcMain.handle('test.list', async (_event, payload) => {
  const schema = z.object({ tagNames: z.array(z.string()).optional() }).optional();
  const data = schema.parse(payload) ?? {};
  const items = await listTests(data.tagNames);
  return { items };
});

ipcMain.handle('test.compose', async (_event, payload) => {
  const data = composeTestSchema.parse(payload);
  const result = await composeTestCase(data);
  return result;
});

ipcMain.handle('test.update', async (_event, payload) => {
  const schema = z.object({
    testId: z.string(),
    patch: z.object({
      title: z.string().optional(),
      filePath: z.string().optional(),
      composition: z.any().optional(),
      snapshotDir: z.string().optional(),
      tagNames: z.array(z.string()).optional(),
      environmentId: z.string().nullable().optional(),
    }),
  });
  const data = schema.parse(payload);
  const updated = await updateTest(data.testId, {
    title: data.patch.title,
    filePath: data.patch.filePath,
    composition: data.patch.composition,
    snapshotDir: data.patch.snapshotDir,
    tagNames: data.patch.tagNames,
    environmentId: data.patch.environmentId ?? undefined,
  } as Partial<TestInput>);
  return { test: updated };
});

ipcMain.handle('dataset.list', async (_event, payload) => {
  const schema = z.object({ tagNames: z.array(z.string()).optional() }).optional();
  const data = schema.parse(payload) ?? {};
  const items = await listDatasets(data.tagNames);
  return { items };
});

ipcMain.handle('dataset.upsert', async (_event, payload) => {
  const data = datasetUpsertSchema.parse(payload);
  const datasetInput: DataSetInput = {
    id: data.datasetId,
    name: data.name,
    description: data.description,
    bindings: data.bindings,
    tagNames: data.tagNames,
  };
  const dataset = await upsertDataset(datasetInput);
  return { dataset };
});

ipcMain.handle('tag.list', async () => {
  const items = await listTags();
  return { items };
});

ipcMain.handle('runner.start', async (_event, payload) => {
  const data = runStartSchema.parse(payload);
  const record = startRun({
    testIds: data.testIds,
    headed: data.headed,
    workers: data.workers,
  });
  return { record };
});

ipcMain.handle('runner.stop', async (_event, payload) => {
  const schema = z.object({ runId: z.string() });
  const data = schema.parse(payload);
  stopRun(data.runId);
  return { runId: data.runId };
});

ipcMain.handle('runner.history', async (_event, payload) => {
  const schema = z.object({ limit: z.number().int().min(1).max(200).optional() }).optional();
  const { limit } = schema.parse(payload) ?? {};
  const items = await listRunResults(limit ?? 50);
  return { items };
});

ipcMain.handle('runner.openArtifact', async (_event, payload) => {
  const schema = z.object({ path: z.string().min(1) });
  const { path } = schema.parse(payload);
  await access(path, constants.R_OK);
  await shell.openPath(path);
  return { opened: true };
});

ipcMain.handle('runner.summary', async (_event, payload) => {
  const schema = z.object({ path: z.string().min(1) });
  const { path } = schema.parse(payload);
  await access(path, constants.R_OK);
  const raw = await readFile(path, 'utf8');
  const json = JSON.parse(raw) as { suites?: Array<any> };

  const stats = { total: 0, passed: 0, failed: 0, skipped: 0 };
  const details: RunSummaryDetail[] = [];
  const attachmentHydrationQueue: Array<{ attachment: RunnerAttachment; path: string; contentType?: string }> = [];

  function registerResult(
    title: string,
    status: string,
    duration?: number,
    error?: string,
    attachments?: RunnerAttachment[],
  ) {
    stats.total += 1;
    if (status === 'passed') stats.passed += 1;
    else if (status === 'failed') stats.failed += 1;
    else stats.skipped += 1;
    details.push({ title, status, duration, error, attachments });
  }

  function guessContentType(filePath?: string): string | undefined {
    if (!filePath) return undefined;
    if (/\.png$/i.test(filePath)) return 'image/png';
    if (/\.jpe?g$/i.test(filePath)) return 'image/jpeg';
    if (/\.webp$/i.test(filePath)) return 'image/webp';
    if (/\.gif$/i.test(filePath)) return 'image/gif';
    return undefined;
  }

  function isImageAttachment(attachment: RunnerAttachment): boolean {
    return Boolean(
      (attachment.contentType && attachment.contentType.startsWith('image/')) ||
        (attachment.path && guessContentType(attachment.path)),
    );
  }

  function toDataUrl(base64: string, contentType?: string) {
    const type = contentType ?? 'image/png';
    return `data:${type};base64,${base64}`;
  }

  function mapAttachments(result: any): RunnerAttachment[] | undefined {
    if (!Array.isArray(result?.attachments)) return undefined;
    const mapped = result.attachments
      .filter((att: any) => att && (typeof att.path === 'string' || typeof att.body === 'string'))
      .map((att: any) => {
        const normalized: RunnerAttachment = {
          name: typeof att.name === 'string' ? att.name : 'attachment',
          path: typeof att.path === 'string' ? att.path : undefined,
          contentType: typeof att.contentType === 'string' ? att.contentType : undefined,
          body: typeof att.body === 'string' ? att.body : undefined,
        };
        if (!normalized.contentType) {
          normalized.contentType = guessContentType(normalized.path);
        }
        if (normalized.body && isImageAttachment(normalized)) {
          normalized.previewDataUrl = toDataUrl(normalized.body, normalized.contentType);
        } else if (!normalized.body && normalized.path && isImageAttachment(normalized)) {
          attachmentHydrationQueue.push({
            attachment: normalized,
            path: normalized.path,
            contentType: normalized.contentType,
          });
        }
        return normalized;
      });
    return mapped.length ? mapped : undefined;
  }

  function walkSuite(suite: any, parentTitle = '') {
    if (!suite) return;
    const baseTitle = [parentTitle, suite.title].filter(Boolean).join(' › ');
    if (Array.isArray(suite.specs)) {
      suite.specs.forEach((spec: any) => {
        const specTitle = [baseTitle, spec.title].filter(Boolean).join(' › ');
        if (Array.isArray(spec.tests)) {
          spec.tests.forEach((test: any) => {
            const result = Array.isArray(test.results) ? test.results[test.results.length - 1] : undefined;
            const status = result?.status ?? test.status ?? 'unknown';
            const error = result?.error?.message ?? test.error?.message;
            const attachments = mapAttachments(result);
            registerResult(specTitle, status, result?.duration, error, attachments);
          });
        }
      });
    }
    if (Array.isArray(suite.suites)) {
      suite.suites.forEach((child: any) => walkSuite(child, baseTitle));
    }
  }

  if (Array.isArray(json.suites)) {
    json.suites.forEach((suite) => walkSuite(suite));
  }

  if (attachmentHydrationQueue.length) {
    await Promise.all(
      attachmentHydrationQueue.map(async ({ attachment, path: attachmentPath, contentType }) => {
        try {
          const buffer = await readFile(attachmentPath);
          const type = contentType ?? guessContentType(attachmentPath) ?? 'image/png';
          attachment.contentType = attachment.contentType ?? type;
          if (!attachment.previewDataUrl && type.startsWith('image/')) {
            attachment.previewDataUrl = toDataUrl(buffer.toString('base64'), type);
          }
        } catch (error) {
          console.warn('Failed to hydrate attachment preview', attachmentPath, error);
        }
      }),
    );
  }

  return { stats, details };
});
