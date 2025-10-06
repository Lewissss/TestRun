import { Prisma, PrismaClient, Tag, RunResult } from '@prisma/client';
import { prisma } from './client';

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

export interface StepInput {
  index: number;
  type: string;
  route?: string | null;
  selector?: string | null;
  role?: string | null;
  name?: string | null;
  testid?: string | null;
  apiHints?: Prisma.JsonValue | null;
  screenshot: string;
  customName?: string | null;
  deleted?: boolean;
  paramHints?: Prisma.JsonValue | null;
}

export interface RecordingInput {
  id?: string;
  name: string;
  description?: string | null;
  baseUrl: string;
  viewportW: number;
  viewportH: number;
  scale: number;
  traceZipPath: string;
  flowLogPath: string;
  steps: StepInput[];
  tagNames?: string[];
}

export interface BlockParamInput {
  name: string;
  label?: string | null;
  type: string;
  required: boolean;
  defaultValue?: string | null;
  enumValues?: string | null;
}

export interface BlockInput {
  id?: string;
  title: string;
  description?: string | null;
  block: Prisma.JsonValue;
  params: BlockParamInput[];
  tagNames?: string[];
}

export interface BlockPatch {
  title?: string;
  description?: string | null;
  block?: Prisma.JsonValue;
  params?: BlockParamInput[];
  tagNames?: string[];
}

export interface ApiSessionInput {
  id?: string;
  name: string;
  description?: string | null;
  baseUrl?: string | null;
  tagNames?: string[];
}

export interface ApiSessionPatch {
  name?: string;
  description?: string | null;
  baseUrl?: string | null;
  tagNames?: string[];
}

export interface ApiRequestInput {
  id?: string;
  apiSessionId: string;
  name: string;
  method: string;
  url: string;
  headers?: Prisma.JsonValue;
  query?: Prisma.JsonValue;
  bodyMode?: string | null;
  body?: string | null;
  auth?: Prisma.JsonValue;
  preScripts?: string | null;
  postScripts?: string | null;
  assertions?: Prisma.JsonValue;
}

export interface ApiRequestPatch extends Partial<ApiRequestInput> {}

export interface ApiRequestExecutionSnapshot {
  status?: number | null;
  latencyMs?: number | null;
  responseHeaders?: Prisma.JsonValue | null;
  responseBody?: string | null;
}

export interface ApiBlockInput {
  id?: string;
  title: string;
  description?: string | null;
  actions: Prisma.JsonValue;
  params: BlockParamInput[];
  tagNames?: string[];
  version?: number;
}

export interface ApiBlockPatch {
  title?: string;
  description?: string | null;
  actions?: Prisma.JsonValue;
  params?: BlockParamInput[];
  tagNames?: string[];
}

export interface EnvironmentInput {
  id?: string;
  name: string;
  description?: string | null;
  variables: Prisma.JsonValue;
}

export interface TestInput {
  id?: string;
  title: string;
  filePath: string;
  composition: Prisma.JsonValue;
  snapshotDir: string;
  tagNames?: string[];
  environmentId?: string | null;
}

export interface DataSetInput {
  id?: string;
  name: string;
  description?: string | null;
  bindings: Prisma.JsonValue;
  tagNames?: string[];
}

export interface RunResultInput {
  id: string;
  status: string;
  testIds: Prisma.JsonValue;
  startedAt: Date;
  completedAt?: Date | null;
  logPath?: string | null;
  summaryPath?: string | null;
  summaryJsonPath?: string | null;
}

function normalizeJsonInput(value: Prisma.JsonValue | null | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === null) return Prisma.JsonNull;
  if (value === undefined) return undefined;
  return value as Prisma.InputJsonValue;
}

async function ensureTags(tagNames: string[] | undefined, client: PrismaClientOrTx = prisma): Promise<Tag[]> {
  if (!tagNames || tagNames.length === 0) {
    return [];
  }
  const unique = Array.from(new Set(tagNames.map((name) => name.trim()).filter(Boolean)));
  const tags = await Promise.all(
    unique.map((name) =>
      client.tag.upsert({
        where: { name },
        update: {},
        create: { name },
      }),
    ),
  );
  return tags;
}

export async function listTags() {
  return prisma.tag.findMany({ orderBy: { name: 'asc' } });
}

export async function listRecordings() {
  return prisma.recording.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      steps: { orderBy: { index: 'asc' } },
      tags: true,
    },
  });
}

export async function getRecordingById(id: string) {
  return prisma.recording.findUnique({
    where: { id },
    include: {
      steps: { orderBy: { index: 'asc' } },
      tags: true,
    },
  });
}

export async function createRecording(input: RecordingInput) {
  const tags = await ensureTags(input.tagNames);
  return prisma.recording.create({
    data: {
      id: input.id,
      name: input.name,
      description: input.description,
      baseUrl: input.baseUrl,
      viewportW: input.viewportW,
      viewportH: input.viewportH,
      scale: input.scale,
      traceZipPath: input.traceZipPath,
      flowLogPath: input.flowLogPath,
      steps: {
        create: input.steps.map((step) => {
          const payload: Prisma.StepCreateWithoutRecordingInput = {
            index: step.index,
            type: step.type,
            route: step.route,
            selector: step.selector,
            role: step.role,
            name: step.name,
            testid: step.testid,
            screenshot: step.screenshot,
            customName: step.customName,
            deleted: step.deleted ?? false,
          };
          const apiHints = normalizeJsonInput(step.apiHints);
          if (apiHints !== undefined) payload.apiHints = apiHints;
          const paramHints = normalizeJsonInput(step.paramHints);
          if (paramHints !== undefined) payload.paramHints = paramHints;
          return payload;
        }),
      },
      tags: {
        connect: tags.map((tag) => ({ id: tag.id })),
      },
    },
    include: {
      steps: { orderBy: { index: 'asc' } },
      tags: true,
    },
  });
}

export async function updateRecording(id: string, patch: Partial<Omit<RecordingInput, 'steps'>>) {
  const { tagNames, ...rest } = patch;
  return prisma.$transaction(async (tx) => {
    let tagData: Tag[] = [];
    if (tagNames) {
      tagData = await ensureTags(tagNames, tx);
    }

    const updated = await tx.recording.update({
      where: { id },
      data: {
        ...rest,
        tags: tagNames
          ? {
              set: tagData.map((tag) => ({ id: tag.id })),
            }
          : undefined,
      },
      include: {
        steps: { orderBy: { index: 'asc' } },
        tags: true,
      },
    });

    return updated;
  });
}

export async function listBlocks(tagNames?: string[]) {
  return prisma.stepTemplate.findMany({
    where: tagNames && tagNames.length ? { tags: { some: { name: { in: tagNames } } } } : undefined,
    orderBy: { updatedAt: 'desc' },
    include: { params: true, tags: true },
  });
}

export async function getBlock(blockId: string, version?: number) {
  return prisma.stepTemplate.findFirst({
    where: {
      id: blockId,
      version,
    },
    include: { params: true, tags: true },
    orderBy: { version: 'desc' },
  });
}

export async function createBlock(input: BlockInput) {
  return prisma.$transaction(async (tx) => {
    const tags = await ensureTags(input.tagNames, tx);
    const created = await tx.stepTemplate.create({
      data: {
        id: input.id,
        title: input.title,
        description: input.description,
        block: normalizeJsonInput(input.block) ?? Prisma.JsonNull,
        params: {
          create: input.params.map((param) => ({
            name: param.name,
            label: param.label,
            type: param.type,
            required: param.required,
            defaultValue: param.defaultValue,
            enumValues: param.enumValues,
          })),
        },
        tags: {
          connect: tags.map((tag) => ({ id: tag.id })),
        },
      },
      include: { params: true, tags: true },
    });
    return created;
  });
}

export async function updateBlock(blockId: string, patch: BlockPatch) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.stepTemplate.findUnique({ where: { id: blockId }, include: { params: true } });
    if (!existing) {
      throw new Error(`Block ${blockId} not found`);
    }

    const nextVersion = existing.version + 1;
    let tagData: Tag[] = [];
    if (patch.tagNames) {
      tagData = await ensureTags(patch.tagNames, tx);
    }

    if (patch.params) {
      await tx.param.deleteMany({ where: { stepTemplateId: blockId } });
    }

    const updated = await tx.stepTemplate.update({
      where: { id: blockId },
      data: {
        title: patch.title ?? existing.title,
        description: patch.description ?? existing.description,
        block: patch.block !== undefined ? normalizeJsonInput(patch.block) ?? Prisma.JsonNull : undefined,
        version: nextVersion,
        params: patch.params
          ? {
              create: patch.params.map((param) => ({
                name: param.name,
                label: param.label,
                type: param.type,
                required: param.required,
                defaultValue: param.defaultValue,
                enumValues: param.enumValues,
              })),
            }
          : undefined,
        tags: patch.tagNames
          ? {
              set: tagData.map((tag) => ({ id: tag.id })),
            }
          : undefined,
      },
      include: { params: true, tags: true },
    });

    return updated;
  });
}

export async function listApiSessions(tagNames?: string[]) {
  return prisma.apiSession.findMany({
    where: tagNames && tagNames.length ? { tags: { some: { name: { in: tagNames } } } } : undefined,
    orderBy: { updatedAt: 'desc' },
    include: { tags: true, requests: { orderBy: { updatedAt: 'desc' } } },
  });
}

export async function getApiSessionById(id: string) {
  return prisma.apiSession.findUnique({
    where: { id },
    include: { tags: true, requests: { orderBy: { updatedAt: 'desc' } } },
  });
}

export async function createApiSession(input: ApiSessionInput) {
  return prisma.$transaction(async (tx) => {
    const tags = await ensureTags(input.tagNames, tx);
    const created = await tx.apiSession.create({
      data: {
        id: input.id,
        name: input.name,
        description: input.description,
        baseUrl: input.baseUrl,
        tags: {
          connect: tags.map((tag) => ({ id: tag.id })),
        },
      },
      include: { tags: true, requests: { orderBy: { updatedAt: 'desc' } } },
    });
    return created;
  });
}

export async function updateApiSession(id: string, patch: ApiSessionPatch) {
  return prisma.$transaction(async (tx) => {
    const { tagNames, ...rest } = patch;
    let tags: Tag[] = [];
    if (tagNames) {
      tags = await ensureTags(tagNames, tx);
    }

    const updated = await tx.apiSession.update({
      where: { id },
      data: {
        ...rest,
        tags: tagNames
          ? {
              set: tags.map((tag) => ({ id: tag.id })),
            }
          : undefined,
      },
      include: { tags: true, requests: { orderBy: { updatedAt: 'desc' } } },
    });
    return updated;
  });
}

export async function createApiRequest(input: ApiRequestInput) {
  return prisma.apiRequest.create({
    data: {
      id: input.id,
      apiSessionId: input.apiSessionId,
      name: input.name,
      method: input.method,
      url: input.url,
      headers: normalizeJsonInput(input.headers) ?? Prisma.JsonNull,
      query: normalizeJsonInput(input.query) ?? Prisma.JsonNull,
      bodyMode: input.bodyMode,
      body: input.body,
      auth: normalizeJsonInput(input.auth) ?? Prisma.JsonNull,
      preScripts: input.preScripts,
      postScripts: input.postScripts,
      assertions: normalizeJsonInput(input.assertions) ?? Prisma.JsonNull,
    },
  });
}

export async function updateApiRequest(id: string, patch: ApiRequestPatch) {
  const { headers, query, auth, assertions, ...rest } = patch;
  return prisma.apiRequest.update({
    where: { id },
    data: {
      ...rest,
      headers: headers !== undefined ? normalizeJsonInput(headers) ?? Prisma.JsonNull : undefined,
      query: query !== undefined ? normalizeJsonInput(query) ?? Prisma.JsonNull : undefined,
      auth: auth !== undefined ? normalizeJsonInput(auth) ?? Prisma.JsonNull : undefined,
      assertions: assertions !== undefined ? normalizeJsonInput(assertions) ?? Prisma.JsonNull : undefined,
    },
  });
}

export async function getApiRequestById(id: string) {
  return prisma.apiRequest.findUnique({ where: { id } });
}

export async function recordApiRequestExecution(id: string, snapshot: ApiRequestExecutionSnapshot) {
  await prisma.apiRequest.update({
    where: { id },
    data: {
      lastStatus: snapshot.status ?? null,
      lastLatencyMs: snapshot.latencyMs ?? null,
      lastRespHeaders: snapshot.responseHeaders !== undefined ? normalizeJsonInput(snapshot.responseHeaders) ?? Prisma.JsonNull : undefined,
      lastRespBody: snapshot.responseBody ?? null,
    },
  });
}

export async function deleteApiRequest(id: string) {
  await prisma.apiRequest.delete({ where: { id } });
}

export async function deleteApiSession(id: string) {
  await prisma.apiSession.delete({ where: { id } });
}

export async function listApiBlocks(tagNames?: string[]) {
  return prisma.apiBlock.findMany({
    where: tagNames && tagNames.length ? { tags: { some: { name: { in: tagNames } } } } : undefined,
    orderBy: { updatedAt: 'desc' },
    include: { params: true, tags: true },
  });
}

export async function getApiBlock(blockId: string, version?: number) {
  return prisma.apiBlock.findFirst({
    where: {
      id: blockId,
      version,
    },
    include: { params: true, tags: true },
    orderBy: { version: 'desc' },
  });
}

export async function createApiBlock(input: ApiBlockInput) {
  return prisma.$transaction(async (tx) => {
    const tags = await ensureTags(input.tagNames, tx);
    const created = await tx.apiBlock.create({
      data: {
        id: input.id,
        title: input.title,
        description: input.description,
        actions: normalizeJsonInput(input.actions) ?? Prisma.JsonNull,
        version: input.version ?? undefined,
        params: {
          create: input.params.map((param) => ({
            name: param.name,
            label: param.label,
            type: param.type,
            required: param.required,
            defaultValue: param.defaultValue,
            enumValues: param.enumValues,
          })),
        },
        tags: {
          connect: tags.map((tag) => ({ id: tag.id })),
        },
      },
      include: { params: true, tags: true },
    });
    return created;
  });
}

export async function updateApiBlock(blockId: string, patch: ApiBlockPatch) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.apiBlock.findUnique({ where: { id: blockId }, include: { params: true } });
    if (!existing) {
      throw new Error(`API block ${blockId} not found`);
    }

    const nextVersion = existing.version + 1;
    let tagData: Tag[] = [];
    if (patch.tagNames) {
      tagData = await ensureTags(patch.tagNames, tx);
    }

    if (patch.params) {
      await tx.param.deleteMany({ where: { apiBlockId: blockId } });
    }

    const updated = await tx.apiBlock.update({
      where: { id: blockId },
      data: {
        title: patch.title ?? existing.title,
        description: patch.description ?? existing.description,
        actions: patch.actions !== undefined ? normalizeJsonInput(patch.actions) ?? Prisma.JsonNull : undefined,
        version: nextVersion,
        params: patch.params
          ? {
              create: patch.params.map((param) => ({
                name: param.name,
                label: param.label,
                type: param.type,
                required: param.required,
                defaultValue: param.defaultValue,
                enumValues: param.enumValues,
              })),
            }
          : undefined,
        tags: patch.tagNames
          ? {
              set: tagData.map((tag) => ({ id: tag.id })),
            }
          : undefined,
      },
      include: { params: true, tags: true },
    });

    return updated;
  });
}

export async function listEnvironments() {
  return prisma.environment.findMany({ orderBy: { name: 'asc' } });
}

export async function upsertEnvironment(input: EnvironmentInput) {
  if (input.id) {
    return prisma.environment.update({
      where: { id: input.id },
      data: {
        name: input.name,
        description: input.description,
        variables: normalizeJsonInput(input.variables) ?? Prisma.JsonNull,
      },
    });
  }
  return prisma.environment.create({
    data: {
      name: input.name,
      description: input.description,
      variables: normalizeJsonInput(input.variables) ?? Prisma.JsonNull,
    },
  });
}

export async function deleteEnvironment(id: string) {
  await prisma.environment.delete({ where: { id } });
}

export async function getEnvironmentById(id: string) {
  return prisma.environment.findUnique({ where: { id } });
}

export async function listTests(tagNames?: string[]) {
  return prisma.testCase.findMany({
    where: tagNames && tagNames.length ? { tags: { some: { name: { in: tagNames } } } } : undefined,
    orderBy: { createdAt: 'desc' },
    include: { tags: true, environment: true },
  });
}

export async function createTest(input: TestInput) {
  return prisma.$transaction(async (tx) => {
    const tags = await ensureTags(input.tagNames, tx);
    const created = await tx.testCase.create({
      data: {
        id: input.id,
        title: input.title,
        filePath: input.filePath,
        composition: normalizeJsonInput(input.composition) ?? Prisma.JsonNull,
        snapshotDir: input.snapshotDir,
        environmentId: input.environmentId ?? undefined,
        tags: {
          connect: tags.map((tag) => ({ id: tag.id })),
        },
      },
      include: { tags: true, environment: true },
    });
    return created;
  });
}

export async function updateTest(id: string, patch: Partial<TestInput>) {
  return prisma.$transaction(async (tx) => {
    const { tagNames, composition, environmentId, ...rest } = patch;
    let tags: Tag[] = [];
    if (tagNames) {
      tags = await ensureTags(tagNames, tx);
    }

    const updated = await tx.testCase.update({
      where: { id },
      data: {
        ...rest,
        composition: composition !== undefined ? normalizeJsonInput(composition) ?? Prisma.JsonNull : undefined,
        environmentId:
          environmentId === undefined ? undefined : environmentId ? environmentId : null,
        tags: tagNames
          ? {
              set: tags.map((tag) => ({ id: tag.id })),
            }
          : undefined,
      },
      include: { tags: true, environment: true },
    });

    return updated;
  });
}

export async function getDatasetById(id: string) {
  return prisma.dataSet.findUnique({ where: { id }, include: { tags: true } });
}

export async function listDatasets(tagNames?: string[]) {
  return prisma.dataSet.findMany({
    where: tagNames && tagNames.length ? { tags: { some: { name: { in: tagNames } } } } : undefined,
    orderBy: { name: 'asc' },
    include: { tags: true },
  });
}

export async function upsertDataset(input: DataSetInput) {
  return prisma.$transaction(async (tx) => {
    const tags = await ensureTags(input.tagNames, tx);
    if (input.id) {
      const updated = await tx.dataSet.update({
        where: { id: input.id },
        data: {
          name: input.name,
          description: input.description,
          bindings: normalizeJsonInput(input.bindings) ?? Prisma.JsonNull,
          tags: {
            set: tags.map((tag) => ({ id: tag.id })),
          },
        },
        include: { tags: true },
      });
      return updated;
    }

    const created = await tx.dataSet.create({
      data: {
        name: input.name,
        description: input.description,
        bindings: normalizeJsonInput(input.bindings) ?? Prisma.JsonNull,
        tags: {
          connect: tags.map((tag) => ({ id: tag.id })),
        },
      },
      include: { tags: true },
    });
    return created;
  });
}

export async function createRunResult(input: RunResultInput) {
  return prisma.runResult.create({
    data: {
      id: input.id,
      status: input.status,
      testIds: normalizeJsonInput(input.testIds) ?? Prisma.JsonNull,
      startedAt: input.startedAt,
      completedAt: input.completedAt ?? undefined,
      logPath: input.logPath ?? undefined,
      summaryPath: input.summaryPath ?? undefined,
      summaryJsonPath: input.summaryJsonPath ?? undefined,
    },
  });
}

export async function updateRunResult(id: string, patch: Partial<RunResultInput>) {
  return prisma.runResult.update({
    where: { id },
    data: {
      status: patch.status,
      testIds: patch.testIds ? normalizeJsonInput(patch.testIds) ?? Prisma.JsonNull : undefined,
      completedAt: patch.completedAt ?? undefined,
      logPath: patch.logPath ?? undefined,
      summaryPath: patch.summaryPath ?? undefined,
      summaryJsonPath: patch.summaryJsonPath ?? undefined,
    },
  });
}

export async function listRunResults(limit = 50) {
  return prisma.runResult.findMany({ orderBy: { startedAt: 'desc' }, take: limit });
}
