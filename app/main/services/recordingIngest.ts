import { copyFile, mkdir, writeFile, access, readFile, cp, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { format } from 'date-fns';
import { randomUUID } from 'node:crypto';
import { createRecording } from '../db/repositories';
import type { RecordingInput, StepInput } from '../db/repositories';
import type { Prisma } from '@prisma/client';
import type { StepType, ParameterHint } from '@shared/types';
import type { RecordedActionLogEntry, SerializedElement } from '../runners/recorder';

interface RecorderIngestOptions {
  sessionId: string;
  tracePath: string;
  flowLogPath: string;
  artifactsDir: string;
  baseUrl: string;
  viewport: { width: number; height: number; deviceScaleFactor?: number };
}

export async function ingestRecorderArtifacts(options: RecorderIngestOptions) {
  const recordingId = options.sessionId ?? randomUUID();
  const dataRoot = join(process.cwd(), 'data');
  const recordingDir = join(dataRoot, 'recordings', recordingId);
  await mkdir(recordingDir, { recursive: true });

  const traceDest = join(recordingDir, 'trace.zip');
  const flowDest = join(recordingDir, 'flow.ndjson');
  const screenshotsDest = join(recordingDir, 'screenshots');

  const traceExists = await pathExists(options.tracePath);
  if (traceExists) {
    await copyFile(options.tracePath, traceDest);
  }

  if (await pathExists(options.artifactsDir)) {
    const sourceScreens = join(options.artifactsDir, 'screenshots');
    if (await pathExists(sourceScreens)) {
      await cp(sourceScreens, screenshotsDest, { recursive: true });
    }
  }

  if (await pathExists(options.flowLogPath)) {
    await copyFile(options.flowLogPath, flowDest);
  } else {
    await writeFile(flowDest, '', 'utf8');
  }

  const fallbackScreens = await collectScreenshotRelativePaths(recordingId, screenshotsDest);
  const steps = await buildStepsFromFlow({
    flowLogPath: flowDest,
    recordingId,
    fallbackScreens,
  });

  const recordingData: RecordingInput = {
    id: recordingId,
    name: `Recording ${format(new Date(), 'yyyy-MM-dd HH:mm')}`,
    description: null,
    baseUrl: options.baseUrl || 'about:blank',
    viewportW: options.viewport.width,
    viewportH: options.viewport.height,
    scale: options.viewport.deviceScaleFactor ?? 1,
    traceZipPath: traceDest,
    flowLogPath: flowDest,
    steps,
    tagNames: [],
  };

  return createRecording(recordingData);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

interface BuildStepsOptions {
  flowLogPath: string;
  recordingId: string;
  fallbackScreens: string[];
}

async function buildStepsFromFlow({ flowLogPath, recordingId, fallbackScreens }: BuildStepsOptions): Promise<StepInput[]> {
  let content = '';
  try {
    content = await readFile(flowLogPath, 'utf8');
  } catch {
    return buildStepsFromScreenshots(fallbackScreens);
  }

  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const actions: RecordedActionLogEntry[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as RecordedActionLogEntry;
      if (!parsed || typeof parsed !== 'object') continue;
      if (!('kind' in parsed) || !('ts' in parsed)) continue;
      actions.push(parsed);
    } catch {
      continue;
    }
  }

  actions.sort((a, b) => (a.actionIndex ?? 0) - (b.actionIndex ?? 0));

  if (!actions.length) {
    return buildStepsFromScreenshots(fallbackScreens);
  }

  const filteredActions: RecordedActionLogEntry[] = [];
  for (const action of actions) {
    const prev = filteredActions.length ? filteredActions[filteredActions.length - 1] : null;
    if (shouldSkipAction(action, prev)) continue;
    filteredActions.push(action);
  }

  const steps: StepInput[] = [];
  let fallbackIndex = 0;

  for (const action of filteredActions) {
    const screenshot = resolveScreenshot(recordingId, action.screenshot, fallbackScreens, fallbackIndex);
    if (!action.screenshot && fallbackIndex < fallbackScreens.length) {
      fallbackIndex += 1;
    }

    const locator = deriveLocator(action.descriptor);
    const label = deriveElementLabel(action.descriptor) ?? locator.name ?? locator.selector ?? action.descriptor?.tagName ?? null;
    const customName = deriveCustomName(action, label);
    const paramHints = deriveParamHints(action, locator.selector, label, locator);

    const paramHintsJson = paramHints
      ? (paramHints.map((hint) => {
          const payload: Record<string, unknown> = {
            kind: hint.kind,
            fieldLabel: hint.fieldLabel,
            selector: hint.selector,
          };
          if (typeof hint.mask === 'boolean') {
            payload.mask = hint.mask;
          }
          if (hint.inferredName) {
            payload.inferredName = hint.inferredName;
          }
          return payload;
        }) as unknown as Prisma.JsonValue)
      : null;

    const step: StepInput = {
      index: steps.length,
      type: mapActionKindToStepType(action),
      route: action.kind === 'route' ? action.pageUrl ?? null : null,
      selector: locator.selector,
      role: locator.role,
      name: locator.name,
      testid: locator.testid,
      apiHints: null,
      screenshot,
      customName,
      deleted: false,
      paramHints: paramHintsJson,
    };

    steps.push(step);
  }

  steps.sort((a, b) => a.index - b.index);
  steps.forEach((step, index) => {
    step.index = index;
  });

  return steps;
}

function resolveScreenshot(
  recordingId: string,
  relativePath: string | null,
  fallbackScreens: string[],
  fallbackIndex: number,
): string {
  if (relativePath) {
    return toRecordingRelative(recordingId, relativePath);
  }
  if (fallbackScreens.length) {
    const index = Math.min(fallbackIndex, fallbackScreens.length - 1);
    return fallbackScreens[index];
  }
  return '';
}

function buildStepsFromScreenshots(screenshotPaths: string[]): StepInput[] {
  if (!screenshotPaths.length) return [];

  return screenshotPaths.map((path, index) => ({
    index,
    type: index === 0 ? 'route' : 'click',
    route: index === 0 ? null : null,
    selector: null,
    role: null,
    name: null,
    testid: null,
    apiHints: null,
    screenshot: path,
    customName: index === 0 ? 'Open page' : `Step ${index}`,
    deleted: false,
    paramHints: null,
  }));
}

async function collectScreenshotRelativePaths(recordingId: string, screenshotsDir: string): Promise<string[]> {
  try {
    const entries = await readdir(screenshotsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => /\.(png|jpg|jpeg)$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((name) => toRecordingRelative(recordingId, `screenshots/${name}`));
  } catch {
    return [];
  }
}

function toRecordingRelative(recordingId: string, relative: string): string {
  const normalized = relative.replace(/^[./\\]+/, '').replace(/\\/g, '/');
  return `recordings/${recordingId}/${normalized}`;
}

function mapActionKindToStepType(action: RecordedActionLogEntry): StepType {
  switch (action.kind) {
    case 'route':
      return 'route';
    case 'submit':
      return 'submit';
    case 'input': {
      const kind = normalizeControlKind(action.descriptor, action.meta);
      if (kind === 'select') return 'click';
      if (kind === 'toggle') return 'click';
      const inputType = typeof action.meta?.inputType === 'string' ? action.meta.inputType.toLowerCase() : '';
      if (inputType && inputType !== 'inserttext' && !inputType.startsWith('delete')) {
        return 'type';
      }
      return 'type';
    }
    case 'change': {
      const kind = normalizeControlKind(action.descriptor, action.meta);
      if (kind === 'select' || kind === 'toggle') {
        return 'click';
      }
      return 'type';
    }
    case 'keydown':
      if (typeof action.meta === 'object' && action.meta && 'key' in action.meta) {
        const key = String((action.meta as Record<string, unknown>).key ?? '').toLowerCase();
        if (key === 'enter') return 'submit';
      }
      return 'click';
    case 'click':
    case 'select':
    default:
      return 'click';
  }
}

interface LocatorDetails {
  selector: string | null;
  role: string | null;
  name: string | null;
  testid: string | null;
}

function deriveLocator(descriptor?: SerializedElement | null): LocatorDetails {
  if (!descriptor) {
    return { selector: null, role: null, name: null, testid: null };
  }

  const testid = descriptor.testId ?? descriptor.dataset?.testid ?? descriptor.dataset?.testId ?? null;
  const role = descriptor.role ?? inferRoleFromDescriptor(descriptor);
  const name = descriptor.name ?? descriptor.trimmedText ?? null;

  let selector: string | null = null;
  if (testid) {
    selector = `[data-testid="${testid}"]`;
  } else if (descriptor.attributes?.id) {
    selector = `#${descriptor.attributes.id}`;
  } else if (descriptor.attributes?.name) {
    selector = `${descriptor.tagName}[name="${descriptor.attributes.name}"]`;
  } else if (descriptor.selectorHints && descriptor.selectorHints.length) {
    selector = descriptor.selectorHints.find((hint) => !hint.startsWith('role=')) ?? descriptor.selectorHints[0] ?? null;
  }

  if (!selector && role && name) {
    selector = `role=${role}:${name}`;
  }

  if (!selector && descriptor.trimmedText) {
    selector = `text="${descriptor.trimmedText}"`;
  }

  if (!selector && descriptor.classes?.length) {
    selector = `${descriptor.tagName}.${descriptor.classes.slice(0, 3).join('.')}`;
  }

  if (!selector) {
    selector = descriptor.tagName ?? null;
  }

  return {
    selector,
    role,
    name,
    testid,
  };
}

function inferRoleFromDescriptor(descriptor: SerializedElement): string | null {
  const tag = descriptor.tagName?.toLowerCase?.() ?? '';
  const type = descriptor.attributes?.type?.toLowerCase?.() ?? '';

  if (descriptor.role) return descriptor.role;

  switch (tag) {
    case 'button':
      return 'button';
    case 'a':
      return descriptor.attributes?.href ? 'link' : null;
    case 'input':
      if (type === 'submit' || type === 'button') return 'button';
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'email' || type === 'text' || type === 'password' || type === 'search') return 'textbox';
      if (type === 'number') return 'spinbutton';
      return 'textbox';
    case 'textarea':
      return 'textbox';
    case 'select':
      return 'combobox';
    case 'option':
      return 'option';
    case 'form':
      return 'form';
    default:
      return null;
  }
}

function deriveElementLabel(descriptor?: SerializedElement | null): string | null {
  if (!descriptor) return null;
  const candidates = [
    descriptor.name,
    descriptor.trimmedText,
    descriptor.attributes?.placeholder ?? null,
    descriptor.attributes?.['aria-label'] ?? null,
    descriptor.attributes?.id ?? null,
    descriptor.tagName,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function deriveCustomName(action: RecordedActionLogEntry, label: string | null): string | null {
  const safeLabel = label ?? 'element';
  const meta = (typeof action.meta === 'object' && action.meta !== null ? action.meta : {}) as Record<string, unknown>;
  const rawValue = typeof meta.value === 'string' ? meta.value : undefined;
  const masked = Boolean(meta.masked);
  const displayedValue = masked ? '••••' : rawValue;
  const truncatedValue = displayedValue && displayedValue.length > 60 ? `${displayedValue.slice(0, 57)}...` : displayedValue;

  switch (action.kind) {
    case 'route':
      return `Navigate to ${action.pageUrl ?? ''}`.trim();
    case 'click':
      return `Click ${safeLabel}`;
    case 'submit':
      return `Submit ${safeLabel}`;
    case 'input':
    case 'change':
      if (normalizeControlKind(action.descriptor, action.meta) === 'toggle') {
        return `Toggle ${safeLabel}`;
      }
      if (normalizeControlKind(action.descriptor, action.meta) === 'select') {
        if (truncatedValue) {
          return `Select ${truncatedValue} on ${safeLabel}`;
        }
        return `Select option on ${safeLabel}`;
      }
      if (truncatedValue) {
        return `Type ${truncatedValue} into ${safeLabel}`;
      }
      return `Type into ${safeLabel}`;
    case 'keydown':
      if (typeof meta.key === 'string') {
        return `Press ${meta.key}`;
      }
      return 'Press key';
    case 'select':
      if (truncatedValue) {
        return `Select ${truncatedValue} from ${safeLabel}`;
      }
      return `Select from ${safeLabel}`;
    default:
      return null;
  }
}

function deriveParamHints(
  action: RecordedActionLogEntry,
  selector: string | null,
  label: string | null,
  locator: LocatorDetails,
): ParameterHint[] | null {
  if (!['input', 'change', 'keydown'].includes(action.kind)) {
    return null;
  }

  const resolvedSelector = selector ?? (locator.role && locator.name ? `role=${locator.role}:${locator.name}` : null);
  if (!resolvedSelector) return null;

  const meta = (typeof action.meta === 'object' && action.meta !== null ? action.meta : {}) as Record<string, unknown>;
  const masked = Boolean(meta.masked);
  const controlKind = normalizeControlKind(action.descriptor, action.meta);
  if (controlKind === 'toggle' || controlKind === 'select') {
    return null;
  }
  const hintLabel = label ?? resolvedSelector;
  const inferred = inferParamName(hintLabel);

  const hint: ParameterHint = {
    kind: masked ? 'secret' : 'text',
    fieldLabel: hintLabel,
    selector: resolvedSelector,
  };

  if (masked) {
    hint.mask = true;
  }

  if (inferred) {
    hint.inferredName = inferred;
  }

  return [hint];
}

function inferParamName(source: string | null | undefined): string | undefined {
  if (!source) return undefined;
  const cleaned = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (!cleaned.length) return undefined;
  const [first, ...rest] = cleaned;
  return first + rest.map((token) => token.charAt(0).toUpperCase() + token.slice(1)).join('');
}

function shouldSkipAction(action: RecordedActionLogEntry, prev: RecordedActionLogEntry | null): boolean {
  const controlKind = normalizeControlKind(action.descriptor, action.meta);

  if (action.kind === 'input') {
    const meta = normalizeMeta(action.meta);
    if (isAutofillMeta(meta)) return true;
    if (controlKind !== 'text') return true;
    const inputType = String(meta.inputType ?? '').toLowerCase();
    if (inputType && inputType !== 'inserttext' && !inputType.startsWith('delete')) {
      return true;
    }
  }

  if (action.kind === 'change') {
    const meta = normalizeMeta(action.meta);
    if (isAutofillMeta(meta)) return true;
    if (controlKind === 'toggle') {
      return true;
    }
    if (controlKind === 'select' && prev && descriptorsMatch(action.descriptor, prev.descriptor)) {
      return true;
    }
  }

  if (prev) {
    const prevType = mapActionKindToStepType(prev);
    const currentType = mapActionKindToStepType(action);
    if (
      prevType === currentType &&
      descriptorsMatch(prev.descriptor, action.descriptor) &&
      Math.abs((action.ts ?? 0) - (prev.ts ?? 0)) < 150
    ) {
      return true;
    }
  }

  return false;
}

function descriptorsMatch(a?: SerializedElement | null, b?: SerializedElement | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.selectorHints?.length && b.selectorHints?.length) {
    return a.selectorHints.some((hint) => b.selectorHints?.includes(hint));
  }
  if (a.attributes?.id && b.attributes?.id) {
    return a.attributes.id === b.attributes.id;
  }
  if (a.tagName && b.tagName) {
    return a.tagName === b.tagName && a.trimmedText === b.trimmedText;
  }
  return false;
}

function isAutofillMeta(meta: Record<string, unknown> | null | undefined): boolean {
  if (!meta) return false;
  const keysToCheck = ['autofill', 'autoFill', 'isAutofill', 'isAutoFill', 'fromAutofill', 'autoFilled'];
  for (const key of keysToCheck) {
    if (typeof meta[key] === 'boolean' && meta[key]) {
      return true;
    }
  }
  const metaValues = Object.values(meta);
  if (metaValues.some((value) => typeof value === 'string' && value.toLowerCase().includes('autofill'))) {
    return true;
  }
  return false;
}

function normalizeMeta(meta: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (meta && typeof meta === 'object') {
    return meta;
  }
  return {};
}

function normalizeControlKind(
  descriptor: SerializedElement | null | undefined,
  meta: Record<string, unknown> | null | undefined,
): 'text' | 'toggle' | 'select' | 'other' {
  const tag = descriptor?.tagName?.toLowerCase?.() ?? '';
  const inputType = String(meta?.inputType ?? descriptor?.attributes?.type ?? '').toLowerCase();
  if (tag === 'select') return 'select';
  if (tag === 'textarea') return 'text';
  if (tag === 'input') {
    if (['checkbox', 'radio'].includes(inputType)) {
      return 'toggle';
    }
    if (['color', 'range', 'file'].includes(inputType)) {
      return 'other';
    }
    return 'text';
  }
  return 'other';
}
