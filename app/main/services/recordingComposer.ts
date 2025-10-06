import { basename, join } from 'node:path';
import { copyFile, mkdir, access } from 'node:fs/promises';
import { nanoid } from 'nanoid';
import { Prisma } from '@prisma/client';
import type { BlockAction, ParameterHint, Step, StepType } from '@shared/types';
import {
  getRecordingById,
  createBlock,
  type BlockParamInput,
} from '../db/repositories';
import { composeTestCase } from './testComposer';

interface ConvertRecordingOptions {
  recordingId: string;
  testTitle?: string;
  blockTitle?: string;
  includeScreenshots?: boolean;
  tagNames?: string[];
  datasetId?: string;
  environmentId?: string;
}

interface ConvertRecordingResult {
  testId: string;
  filePath: string;
  snapshotDir: string;
  blockId: string;
  blockVersion: number;
}

interface BlockBuildResult {
  actions: BlockAction[];
  params: BlockParamInput[];
  bindings: Record<string, unknown>;
  assets: Map<string, string>;
}

const DATA_ROOT = join(process.cwd(), 'data');

export async function convertRecordingToTest(options: ConvertRecordingOptions): Promise<ConvertRecordingResult> {
  const recording = await getRecordingById(options.recordingId);
  if (!recording) {
    throw new Error('Recording not found.');
  }

  if (!recording.steps.length) {
    throw new Error('Recording has no steps to convert.');
  }

  const includeScreenshots = options.includeScreenshots ?? true;
  const blockTitle = options.blockTitle?.trim() || recording.name || 'Recording Flow';
  const testTitle = options.testTitle?.trim() || `${recording.name ?? 'Recording'} Test`;

  const normalizedSteps = recording.steps.map((step) => normalizeStep(step, recording.id)).filter(Boolean) as Step[];

  const build = buildBlockFromRecording(normalizedSteps, {
    includeScreenshots,
    recordingId: recording.id,
  });

  const block = await createBlock({
    id: nanoid(),
    title: blockTitle,
    description: recording.description ?? undefined,
    block: build.actions as unknown as Prisma.JsonValue,
    params: build.params,
    tagNames: options.tagNames,
  });

  const result = await composeTestCase({
    title: testTitle,
    blocks: [
      {
        kind: 'ui',
        blockId: block.id,
        version: block.version,
        bindings: build.bindings,
      },
    ],
    baseUrl: recording.baseUrl,
    viewport: {
      width: recording.viewportW,
      height: recording.viewportH,
      scale: recording.scale,
    },
    tagNames: options.tagNames,
    datasetId: options.datasetId,
    environmentId: options.environmentId,
  });

  if (includeScreenshots && build.assets.size) {
    const snapshotDir = join(process.cwd(), result.snapshotDir);
    await mkdir(snapshotDir, { recursive: true });
    for (const [filename, source] of build.assets) {
      try {
        await access(source);
        await copyFile(source, join(snapshotDir, filename));
      } catch (error) {
        console.warn(`Failed to copy screenshot ${source}:`, error);
      }
    }
  }

  return {
    testId: result.testId,
    filePath: result.filePath,
    snapshotDir: result.snapshotDir,
    blockId: block.id,
    blockVersion: block.version,
  };
}

function buildBlockFromRecording(steps: Step[], options: { includeScreenshots: boolean; recordingId: string }): BlockBuildResult {
  const actions: BlockAction[] = [];
  const params: BlockParamInput[] = [];
  const bindings: Record<string, unknown> = {};
  const assets = new Map<string, string>();
  const paramByKey = new Map<string, string>();
  let paramCounter = 1;

  const includeScreenshots = options.includeScreenshots;

  for (const step of steps) {
    if (step.deleted) continue;

    const screenshotName = includeScreenshots && step.screenshot ? basename(step.screenshot) : undefined;
    if (includeScreenshots && step.screenshot && screenshotName) {
      assets.set(screenshotName, join(DATA_ROOT, step.screenshot));
    }

    switch (step.type) {
      case 'route':
        actions.push(stripUndefined({
          action: 'route',
          route: step.route ?? undefined,
          screenshot: screenshotName,
        }));
        break;
      case 'click':
      case 'submit': {
        const selector = resolveSelector(step);
        actions.push(stripUndefined({
          action: step.type === 'submit' ? 'submit' : 'click',
          selector,
          screenshot: screenshotName,
        }));
        break;
      }
      case 'type': {
        const selector = resolveSelector(step);
        const hint = extractPrimaryHint(step.paramHints);
        const key = hint?.selector ?? selector ?? `step-${step.index}`;
        let paramName = key ? paramByKey.get(key) : undefined;
        if (!paramName) {
          paramName = deriveParamName(hint, paramCounter++);
          paramByKey.set(key ?? paramName, paramName);
          params.push({
            name: paramName,
            label: hint?.fieldLabel ?? step.name ?? step.customName ?? paramName,
            type: hint?.kind === 'secret' || hint?.mask ? 'secret' : 'string',
            required: true,
            defaultValue: hint?.sampleValue ?? '',
          });
          if (hint?.sampleValue !== undefined) {
            bindings[paramName] = hint.sampleValue;
          } else {
            bindings[paramName] = '';
          }
        }
        actions.push(stripUndefined({
          action: 'type',
          selector,
          value: wrapParamReference(paramName),
          screenshot: screenshotName,
        }));
        break;
      }
      case 'assert':
        actions.push(stripUndefined({
          action: 'assert',
          selector: resolveSelector(step),
          screenshot: screenshotName,
        }));
        break;
      default:
        actions.push(stripUndefined({
          action: 'assert',
          selector: resolveSelector(step),
          screenshot: screenshotName,
        }));
        break;
    }
  }

  return { actions, params, bindings, assets };
}

function resolveSelector(step: Step): string {
  if (step.selector) return step.selector;
  if (step.testid) return `[data-testid=\"${step.testid}\"]`;
  if (step.role && step.name) return `role=${step.role}:${step.name}`;
  if (step.name) return `text=\"${step.name}\"`;
  return '[data-testid="TODO"]';
}

function extractPrimaryHint(paramHints: Step['paramHints']): ParameterHint | null {
  if (!Array.isArray(paramHints) || !paramHints.length) return null;
  return paramHints[0] ?? null;
}

function deriveParamName(hint: ParameterHint | null, counter: number): string {
  if (hint?.inferredName) return hint.inferredName;
  if (hint?.fieldLabel) {
    const candidate = hint.fieldLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean)
      .join('-');
    if (candidate) {
      return candidate.replace(/-([a-z0-9])/g, (_, letter) => letter.toUpperCase());
    }
  }
  return `input${counter}`;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  Object.keys(value).forEach((key) => {
    if (value[key] === undefined || value[key] === null) {
      delete value[key];
    }
  });
  return value;
}

function wrapParamReference(name: string): string {
  return name;
}

function normalizeStep(step: any, recordingId: string): Step {
  const paramHints = coerceParamHints(step.paramHints);
  return {
    id: step.id,
    recordingId,
    index: step.index,
    type: normalizeStepType(step.type),
    route: step.route ?? null,
    selector: step.selector ?? null,
    role: step.role ?? null,
    name: step.name ?? null,
    testid: step.testid ?? null,
    apiHints: step.apiHints as Record<string, unknown> | null,
    screenshot: step.screenshot ?? '',
    customName: step.customName ?? null,
    deleted: Boolean(step.deleted),
    paramHints,
  };
}

function normalizeStepType(type: string): StepType {
  switch (type) {
    case 'route':
    case 'click':
    case 'submit':
    case 'type':
    case 'assert':
      return type;
    default:
      return 'click';
  }
}

function coerceParamHints(value: unknown): ParameterHint[] | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value as ParameterHint[];
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed as ParameterHint[];
      }
    } catch {
      return null;
    }
  }
  return null;
}
