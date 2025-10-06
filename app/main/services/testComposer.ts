import { join, relative } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { Prisma } from '@prisma/client';
import { nanoid } from 'nanoid';
import { getBlock, getDatasetById, getApiBlock, getEnvironmentById, createTest, updateTest } from '../db/repositories';
import type { TestInput } from '../db/repositories';
import {
  generateBlockModule,
  generateApiBlockModule,
  generateTestSpec,
  type TestEntryContext,
} from '../runners/generator';

interface ComposePayload {
  testId?: string;
  title: string;
  blocks: Array<{
    kind: 'ui' | 'api';
    blockId: string;
    version: number;
    bindings: Record<string, unknown>;
    expectations?: unknown;
  }>;
  baseUrl: string;
  viewport: { width: number; height: number; scale?: number };
  tagNames?: string[];
  datasetId?: string;
  environmentId?: string;
}

const TESTS_ROOT = join(process.cwd(), 'tests');
const BLOCKS_DIR = join(TESTS_ROOT, 'blocks');
const GENERATED_DIR = join(TESTS_ROOT, 'generated');
const SNAPSHOT_ROOT = join(TESTS_ROOT, '__screenshots__');

function formatBindingsLiteral(value: Record<string, unknown>): string {
  const json = JSON.stringify(value, null, 2) ?? '{}';
  return json.replace(/\n/g, '\n      ');
}

export async function composeTestCase(payload: ComposePayload) {
  const testId = payload.testId ?? nanoid();
  const specFileRelative = join('tests', 'generated', `${testId}.spec.ts`);
  const specFilePath = join(GENERATED_DIR, `${testId}.spec.ts`);
  const snapshotDirRelative = join('tests', '__screenshots__', testId);
  const snapshotDirPath = join(SNAPSHOT_ROOT, testId);

  await mkdir(BLOCKS_DIR, { recursive: true });
  await mkdir(GENERATED_DIR, { recursive: true });
  await mkdir(snapshotDirPath, { recursive: true });

  let datasetLiteral: string | undefined;
  if (payload.datasetId) {
    const dataset = await getDatasetById(payload.datasetId);
    const bindings = (dataset?.bindings as Record<string, unknown> | undefined) ?? {};
    datasetLiteral = JSON.stringify(bindings, null, 2);
  }

  const entriesContext: TestEntryContext[] = [];

  for (const entry of payload.blocks) {
    if (entry.kind === 'api') {
      const template = await getApiBlock(entry.blockId, entry.version);
      if (!template) {
        throw new Error(`API block ${entry.blockId} v${entry.version} not found`);
      }
      const blockTemplate = {
        id: template.id,
        title: template.title,
        version: template.version,
        actions: template.actions,
        params: template.params.map((param) => ({
          name: param.name,
          label: param.label,
          type: param.type,
          required: param.required,
          defaultValue: param.defaultValue ?? undefined,
          enumValues: param.enumValues ?? undefined,
        })),
      };
      const { filePath, functionName } = await generateApiBlockModule({ template: blockTemplate, outputDir: BLOCKS_DIR });
      const importPath = relative(GENERATED_DIR, filePath).replace(/\\/g, '/').replace(/\.ts$/, '');
      entriesContext.push({
        kind: 'api',
        title: template.title,
        functionName,
        importPath,
        bindingsLiteral: formatBindingsLiteral(entry.bindings),
        isApi: true,
      });
    } else {
      const template = await getBlock(entry.blockId, entry.version);
      if (!template) {
        throw new Error(`Block ${entry.blockId} v${entry.version} not found`);
      }
      const blockTemplate = {
        id: template.id,
        title: template.title,
        version: template.version,
        block: template.block,
        params: template.params.map((param) => ({
          name: param.name,
          label: param.label,
          type: param.type,
          required: param.required,
          defaultValue: param.defaultValue ?? undefined,
          enumValues: param.enumValues ?? undefined,
        })),
      };

      const { filePath, functionName } = await generateBlockModule({ template: blockTemplate, outputDir: BLOCKS_DIR });
      const importPath = relative(GENERATED_DIR, filePath).replace(/\\/g, '/').replace(/\.ts$/, '');

      entriesContext.push({
        kind: 'ui',
        title: template.title,
        functionName,
        importPath,
        bindingsLiteral: formatBindingsLiteral(entry.bindings),
        isApi: false,
      });
    }
  }

  const environment = payload.environmentId ? await getEnvironmentById(payload.environmentId) : undefined;

  await generateTestSpec({
    testId,
    title: payload.title,
    baseUrl: payload.baseUrl,
    viewport: payload.viewport,
    entries: entriesContext,
    snapshotDir: snapshotDirRelative,
    outputFile: specFilePath,
    datasetLiteral,
    environmentLiteral: environment ? JSON.stringify(environment.variables ?? {}, null, 2) : undefined,
    hasUiEntries: entriesContext.some((entry) => !entry.isApi),
    hasApiEntries: entriesContext.some((entry) => entry.isApi),
  });

  const compositionPayload = {
    nodes: payload.blocks,
    meta: {
      baseUrl: payload.baseUrl,
      viewport: payload.viewport,
      datasetId: payload.datasetId ?? null,
      environmentId: payload.environmentId ?? null,
    },
  } as Prisma.JsonValue;

  const createInput: TestInput = {
    id: testId,
    title: payload.title,
    filePath: specFileRelative,
    composition: compositionPayload,
    snapshotDir: snapshotDirRelative,
    tagNames: payload.tagNames,
    environmentId: payload.environmentId ?? undefined,
  };

  const patch = {
    title: payload.title,
    filePath: specFileRelative,
    composition: compositionPayload,
    snapshotDir: snapshotDirRelative,
    tagNames: payload.tagNames,
    environmentId: payload.environmentId ?? undefined,
  };

  const test = payload.testId ? await updateTest(testId, patch) : await createTest(createInput);

  return {
    testId,
    filePath: specFileRelative,
    snapshotDir: snapshotDirRelative,
    test,
  };
}
