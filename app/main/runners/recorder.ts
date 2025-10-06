import { BrowserContext, chromium, Page } from 'playwright';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import type { WriteStream } from 'node:fs';

const ACTION_BINDING_NAME = '__testrun_recordAction';
const INPUT_DEBOUNCE_MS = 250;

export type RecordedActionKind =
  | 'route'
  | 'click'
  | 'input'
  | 'change'
  | 'submit'
  | 'keydown'
  | 'select';

export interface SerializedElement {
  tagName: string;
  text?: string | null;
  trimmedText?: string | null;
  id?: string | null;
  classes?: string[];
  attributes?: Record<string, string | null>;
  dataset?: Record<string, string>;
  role?: string | null;
  name?: string | null;
  testId?: string | null;
  selectorHints?: string[];
}

export interface RawActionPayload {
  kind: RecordedActionKind;
  ts: number;
  pageUrl: string;
  descriptor: SerializedElement | null;
  meta?: Record<string, unknown>;
}

export interface RecordedActionLogEntry extends RawActionPayload {
  actionIndex: number;
  screenshot: string | null;
}

export interface RecorderOptions {
  baseUrl: string;
  viewport: { width: number; height: number; deviceScaleFactor?: number };
  outputDir?: string;
}

export interface RecorderHandle {
  sessionId: string;
  context: BrowserContext;
  tracePath: string;
  flowLogPath: string;
  artifactsDir: string;
  stop: () => Promise<void>;
}

export async function startRecording(options: RecorderOptions): Promise<RecorderHandle> {
  const sessionId = randomUUID();
  const userData = options.outputDir ?? join(app.getPath('userData'), 'recordings', sessionId);
  await mkdir(userData, { recursive: true });
  const screenshotsDir = join(userData, 'screenshots');
  await mkdir(screenshotsDir, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: {
      width: options.viewport.width,
      height: options.viewport.height,
    },
    deviceScaleFactor: options.viewport.deviceScaleFactor ?? 1,
  });

  const tracePath = join(userData, 'trace.zip');
  const flowLogPath = join(userData, 'flow.ndjson');
  const flowStream = createWriteStream(flowLogPath, { flags: 'a' });

  let lastActionChain = Promise.resolve();
  let actionCounter = 0;
  let isStopping = false;

  await context.exposeBinding(
    ACTION_BINDING_NAME,
    async (source, payload: RawActionPayload | null | undefined) => {
      if (isStopping || !payload) return;
      const page = source?.page;
      if (!page) return;

      const queueNext = async () => {
        await handleRecordedAction({
          page,
          payload,
          screenshotsDir,
          flowStream,
          nextIndex: () => ++actionCounter,
        });
      };

      lastActionChain = lastActionChain.then(queueNext, queueNext);
      return lastActionChain.catch((error) => {
        console.warn('Failed to log recorded action', error);
      });
    },
  );

  await context.addInitScript(
    ({ bindingName, inputDebounce }) => {
      const globalObj: any = globalThis as any;
      const pendingInputs = new Map<string, any>();
      const doc: any = globalObj?.document;

      if (!doc) {
        return;
      }

      const send = (
        kind: RecordedActionKind,
        descriptor: SerializedElement | null,
        meta?: Record<string, unknown>,
      ) => {
        const href = typeof globalObj?.location?.href === 'string' ? globalObj.location.href : '';
        const payload: RawActionPayload = {
          kind,
          descriptor,
          meta,
          ts: Date.now(),
          pageUrl: href,
        };
        globalObj.setTimeout(() => {
          const binding = globalObj?.[bindingName];
          if (typeof binding === 'function') {
            binding(payload).catch(() => {
              /* ignore send errors */
            });
          }
        }, 16);
      };

      const getElementKey = (element: any) => {
        if (!element) return `${Date.now()}-${Math.random()}`;
        const existing = element.__testrunElementId;
        if (existing) return existing as string;
        const assigned =
          typeof globalObj?.crypto?.randomUUID === 'function'
            ? globalObj.crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`;
        element.__testrunElementId = assigned;
        return assigned;
      };

      const serializeElement = (element: any): SerializedElement => {
        if (!element) {
          return {
            tagName: 'unknown',
            text: '',
            trimmedText: '',
            attributes: {},
            dataset: {},
            selectorHints: [],
          };
        }

        const tagName = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : 'unknown';
        const classes = Array.isArray(element.classList)
          ? element.classList.slice()
          : element.classList
          ? Array.from(element.classList as any)
          : [];

        const attributes: Record<string, string | null> = {};
        const attrList: any[] = element.attributes ? Array.from(element.attributes as any) : [];
        for (const attr of attrList) {
          const attrName = typeof attr?.name === 'string' ? attr.name : null;
          if (!attrName) continue;
          attributes[attrName] = typeof attr?.value === 'string' ? attr.value : null;
        }

        const dataset: Record<string, string> = {};
        const datasetSource = (element?.dataset ?? {}) as Record<string, unknown>;
        for (const key of Object.keys(datasetSource)) {
          const value = datasetSource[key];
          if (typeof value === 'string') {
            dataset[key] = value;
          }
        }

        const text = typeof element.innerText === 'string' ? element.innerText : '';
        const trimmedText = text ? text.replace(/\s+/g, ' ').trim() : '';

        const getAttribute = typeof element.getAttribute === 'function' ? element.getAttribute.bind(element) : () => null;
        const role = getAttribute('role');
        const testId = getAttribute('data-testid') || getAttribute('data-test-id') || getAttribute('data-test');

        let name = getAttribute('aria-label');
        const labelsList = element.labels ? Array.from(element.labels as any) : [];
        if (!name && labelsList.length) {
          name = labelsList
            .map((labelNode: any) => (typeof labelNode?.innerText === 'string' ? labelNode.innerText : ''))
            .filter((value: string) => value.trim().length)
            .join(' ')
            .trim();
        }
        if (!name) {
          const labelledBy = getAttribute('aria-labelledby');
          if (labelledBy && typeof labelledBy === 'string') {
            const candidates = labelledBy
              .split(/\s+/)
              .map((id) => {
                const node = typeof doc.getElementById === 'function' ? doc.getElementById(id) : null;
                return node && typeof node.innerText === 'string' ? node.innerText.trim() : null;
              })
              .filter((value): value is string => Boolean(value));
            if (candidates.length) {
              name = candidates.join(' ');
            }
          }
        }
        if (!name && typeof element.closest === 'function') {
          const closestLabel = element.closest('label');
          if (closestLabel && typeof closestLabel.innerText === 'string') {
            name = closestLabel.innerText.trim();
          }
        }
        if (!name) {
          const placeholder = getAttribute('placeholder');
          if (placeholder && typeof placeholder === 'string') {
            name = placeholder.trim();
          }
        }

        const selectorHints: string[] = [];
        if (attributes.id) selectorHints.push(`#${attributes.id}`);
        if (testId) selectorHints.push(`[data-testid="${testId}"]`);
        if (attributes.name) selectorHints.push(`[name="${attributes.name}"]`);
        if (role && name) selectorHints.push(`role=${role}:${name}`);

        return {
          tagName,
          text,
          trimmedText,
          id: attributes.id ?? null,
          classes,
          attributes,
          dataset,
          role,
          name,
          testId,
          selectorHints,
        };
      };

      const textualInputTypes: Record<string, true> = {
        text: true,
        email: true,
        url: true,
        search: true,
        tel: true,
        password: true,
        number: true,
        date: true,
        datetime: true,
        'datetime-local': true,
        month: true,
        week: true,
        time: true,
      };

      const isTextualInput = (element: any): boolean => {
        if (!element) return false;
        const tag = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : '';
        if (tag === 'textarea') return true;
        if (tag !== 'input') return false;
        const type = typeof element.type === 'string' ? element.type.toLowerCase() : '';
        if (!type) return true;
        return Boolean(textualInputTypes[type]);
      };

      const resolveClickableTarget = (node: any): any => {
        if (!node || typeof node !== 'object') return node;
        if (typeof node.closest === 'function') {
          const labelledControl = node.closest('label');
          if (labelledControl && typeof labelledControl.querySelector === 'function') {
            const control = labelledControl.querySelector('input,select,textarea,button');
            if (control) return control;
          }
        }
        const tag = typeof node.tagName === 'string' ? node.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'button' || tag === 'a' || tag === 'select' || tag === 'textarea') {
          return node;
        }
        if (typeof node.querySelector === 'function') {
          const candidate = node.querySelector('input,button,select,textarea,a');
          if (candidate) return candidate;
        }
        if (node.firstElementChild) {
          let child = node.firstElementChild as any;
          while (child) {
            const resolved = resolveClickableTarget(child);
            if (resolved) return resolved;
            child = child.nextElementSibling;
          }
        }
        return node;
      };

      doc.addEventListener('click', (event: any) => {
        const rawTarget = event?.target ?? null;
        if (!rawTarget) return;
        const target = resolveClickableTarget(rawTarget);
        if (!target) return;
        const descriptor = serializeElement(target);
        send('click', descriptor, {
          button: typeof event?.button === 'number' ? event.button : 0,
          detail: typeof event?.detail === 'number' ? event.detail : 0,
          clientX: typeof event?.clientX === 'number' ? event.clientX : null,
          clientY: typeof event?.clientY === 'number' ? event.clientY : null,
        });
      });

      doc.addEventListener('change', (event: any) => {
        const target = event?.target ?? null;
        if (!target) return;
        const descriptor = serializeElement(target);
        let meta: Record<string, unknown> | undefined;
        if (isTextualInput(target)) {
          const value = typeof target.value === 'string' ? target.value : '';
          const type = typeof target.type === 'string' ? target.type.toLowerCase() : '';
          meta = {
            value,
            length: value.length,
            masked: type === 'password',
          };
        }
        send('change', descriptor, meta);
      });

      doc.addEventListener('input', (event: any) => {
        const target = event?.target ?? null;
        if (!isTextualInput(target)) return;
        const descriptor = serializeElement(target);
        const value = typeof target.value === 'string' ? target.value : '';
        const key = getElementKey(target);
        const existing = pendingInputs.get(key);
        if (existing) globalObj.clearTimeout(existing);
        const timer = globalObj.setTimeout(() => {
          pendingInputs.delete(key);
          const type = typeof target.type === 'string' ? target.type.toLowerCase() : '';
          const inputType = typeof event?.inputType === 'string' ? event.inputType : null;
          send('input', descriptor, {
            value,
            length: value.length,
            masked: type === 'password',
            inputType,
          });
        }, inputDebounce);
        pendingInputs.set(key, timer);
      });

      doc.addEventListener('submit', (event: any) => {
        const target = event?.target ?? null;
        if (!target) return;
        const descriptor = serializeElement(target);
        send('submit', descriptor, {});
      });

      doc.addEventListener('keydown', (event: any) => {
        const key = typeof event?.key === 'string' ? event.key : '';
        if (key.toLowerCase() !== 'enter') return;
        const target = event?.target ?? null;
        if (!target) return;
        const descriptor = serializeElement(target);
        send('keydown', descriptor, { key });
      });
    },
    { bindingName: ACTION_BINDING_NAME, inputDebounce: INPUT_DEBOUNCE_MS },
  );

  await context.tracing.start({
    screenshots: false,
    snapshots: true,
    sources: false,
    title: `recording-${sessionId}`,
  });

  const page = await context.newPage();

  const navigationListener = async (navigatedPage: Page, frameUrl: string) => {
    if (isStopping) return;
    lastActionChain = lastActionChain.then(() =>
      recordNavigationEvent({
        page: navigatedPage,
        screenshotsDir,
        flowStream,
        nextIndex: () => ++actionCounter,
        url: frameUrl,
        title: 'Navigate',
      }),
    );
  };

  const attachNavigationHooks = (targetPage: Page) => {
    targetPage.on('framenavigated', (frame) => {
      if (frame !== targetPage.mainFrame()) return;
      if (!frame.url() || frame.url() === 'about:blank') return;
      void navigationListener(targetPage, frame.url());
    });
  };

  attachNavigationHooks(page);
  context.on('page', (newPage) => {
    attachNavigationHooks(newPage);
  });

  if (options.baseUrl) {
    await page.goto(options.baseUrl, { waitUntil: 'load' });
  }

  async function stop() {
    if (isStopping) return;
    isStopping = true;

    try {
      await lastActionChain.catch(() => undefined);
      await context.tracing.stop({ path: tracePath });
    } finally {
      await new Promise<void>((resolve) => flowStream.end(() => resolve()));
      await context.close();
      await browser.close();
    }
  }

  return { sessionId, context, tracePath, flowLogPath, artifactsDir: userData, stop };
}

interface HandleRecordedActionOptions {
  page: Page;
  payload: RawActionPayload;
  screenshotsDir: string;
  flowStream: WriteStream;
  nextIndex: () => number;
}

async function handleRecordedAction({
  page,
  payload,
  screenshotsDir,
  flowStream,
  nextIndex,
}: HandleRecordedActionOptions) {
  const actionIndex = nextIndex();
  const delay = (() => {
    switch (payload.kind) {
      case 'input':
        return 140;
      case 'change':
        return 160;
      case 'submit':
        return 220;
      case 'keydown':
        return 160;
      case 'click':
      default:
        return 180;
    }
  })();

  const screenshotFile = await captureActionScreenshot(page, screenshotsDir, actionIndex, {
    delay,
  });

  const entry: RecordedActionLogEntry = {
    ...payload,
    actionIndex,
    screenshot: screenshotFile ? joinRelativePaths('screenshots', screenshotFile) : null,
  };

  await appendFlowEntry(flowStream, entry);
}

interface NavigationRecordOptions {
  page: Page;
  screenshotsDir: string;
  flowStream: WriteStream;
  nextIndex: () => number;
  url: string;
  title: string;
}

async function recordNavigationEvent({
  page,
  screenshotsDir,
  flowStream,
  nextIndex,
  url,
  title,
}: NavigationRecordOptions) {
  const actionIndex = nextIndex();
  const screenshotFile = await captureActionScreenshot(page, screenshotsDir, actionIndex, {
    waitFor: 'load',
    delay: 320,
  });

  const entry: RecordedActionLogEntry = {
    kind: 'route',
    ts: Date.now(),
    pageUrl: url,
    descriptor: null,
    meta: { title },
    actionIndex,
    screenshot: screenshotFile ? joinRelativePaths('screenshots', screenshotFile) : null,
  };

  await appendFlowEntry(flowStream, entry);
}

interface CaptureOptions {
  waitFor?: 'load' | 'domcontentloaded' | 'networkidle' | null;
  delay?: number;
}

async function captureActionScreenshot(
  page: Page,
  screenshotsDir: string,
  index: number,
  options: CaptureOptions = {},
): Promise<string | null> {
  try {
    if (page.isClosed()) return null;

    const waitFor = options.waitFor;
    if (waitFor) {
      await page.waitForLoadState(waitFor, { timeout: 5000 }).catch(() => undefined);
    } else {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => undefined);
    }

    const delay = options.delay ?? 150;
    if (delay > 0) {
      await page.waitForTimeout(delay).catch(() => undefined);
    }

    await mkdir(screenshotsDir, { recursive: true });
    const filename = `step-${String(index).padStart(4, '0')}.png`;
    const filePath = join(screenshotsDir, filename);
    await page.screenshot({ path: filePath, fullPage: true });
    return filename;
  } catch (error) {
    console.warn('Failed to capture screenshot for action', error);
    return null;
  }
}

async function appendFlowEntry(stream: WriteStream, entry: RecordedActionLogEntry) {
  await new Promise<void>((resolve, reject) => {
    stream.write(`${JSON.stringify(entry)}\n`, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function joinRelativePaths(base: string, filename: string): string {
  return `${base}/${filename}`;
}
