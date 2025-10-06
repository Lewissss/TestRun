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

  const consumeActionIndex = () => actionCounter++;

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
          nextIndex: consumeActionIndex,
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
      const elementIds = new WeakMap<any, string>();

      const OVERLAY_ID = '__testrun_recorder_overlay';
      const OVERLAY_STYLE_ID = '__testrun_recorder_overlay_style';
      const MIN_VISIBLE_MS = 2000;

      const ensureOverlayStyle = () => {
        const doc = globalObj.document;
        if (!doc) return;
        if (doc.getElementById(OVERLAY_STYLE_ID)) return;
        const style = doc.createElement('style');
        style.id = OVERLAY_STYLE_ID;
        style.textContent = `
          #${OVERLAY_ID} {
            position: fixed;
            inset: 0;
            background: rgba(9, 12, 20, 0.72);
            z-index: 2147483646;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #f8fafc;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 15px;
            letter-spacing: 0.02em;
            backdrop-filter: blur(6px);
            transition: opacity 160ms ease;
            pointer-events: all;
          }
          #${OVERLAY_ID}[data-state='hidden'] {
            opacity: 0;
            pointer-events: none;
          }
          #${OVERLAY_ID} .testrun-recorder-overlay__inner {
            padding: 18px 28px;
            border-radius: 12px;
            background: rgba(15, 18, 30, 0.88);
            box-shadow: 0 18px 48px rgba(5, 8, 20, 0.45);
            display: flex;
            align-items: center;
            gap: 12px;
          }
          #${OVERLAY_ID} .testrun-recorder-overlay__spinner {
            width: 16px;
            height: 16px;
            border-radius: 999px;
            border: 2px solid rgba(255, 255, 255, 0.35);
            border-top-color: #5eead4;
            animation: __testrun_spin 1s linear infinite;
          }
          @keyframes __testrun_spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `;
        (doc.head ?? doc.documentElement).appendChild(style);
      };

      const showOverlay = () => {
        const doc = globalObj.document;
        if (!doc || !doc.documentElement) return;
        const currentHref = typeof globalObj.location?.href === 'string' ? globalObj.location.href : '';
        if (!currentHref || currentHref === 'about:blank') {
          return;
        }
        ensureOverlayStyle();
        let overlay = doc.getElementById(OVERLAY_ID);
        if (!overlay) {
          overlay = doc.createElement('div');
          overlay.id = OVERLAY_ID;
          overlay.innerHTML = `
            <div class="testrun-recorder-overlay__inner">
              <span class="testrun-recorder-overlay__spinner"></span>
              <span>Preparing recorder…</span>
            </div>
          `;
          (doc.body ?? doc.documentElement).appendChild(overlay);
        }
        overlay.setAttribute('data-state', 'visible');
        overlay.style.opacity = '1';
        overlay.style.pointerEvents = 'all';
        overlay.setAttribute('data-created-at', String(Date.now()));
      };

      const hideOverlay = () => {
        const doc = globalObj.document;
        if (!doc) return;
        const overlay = doc.getElementById(OVERLAY_ID);
        if (!overlay) return;
        const createdAt = Number(overlay.getAttribute('data-created-at') ?? '0');
        const elapsed = Date.now() - createdAt;
        const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
        const performHide = () => {
          overlay.setAttribute('data-state', 'hidden');
          overlay.style.pointerEvents = 'none';
          globalObj.setTimeout(() => {
            if (overlay.parentNode) {
              overlay.parentNode.removeChild(overlay);
            }
          }, 220);
        };
        if (remaining > 0) {
          overlay.style.pointerEvents = 'all';
          globalObj.setTimeout(performHide, remaining);
        } else {
          performHide();
        }
      };

      const readyEventName = '__testrun-recorder-ready';

      const attachOverlayGuards = () => {
        showOverlay();
        globalObj.addEventListener(readyEventName, hideOverlay, { once: false });
        globalObj.addEventListener('load', hideOverlay, { once: false });
      };

      if (globalObj.document?.readyState === 'loading') {
        globalObj.addEventListener('DOMContentLoaded', attachOverlayGuards, { once: true });
      } else {
        attachOverlayGuards();
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
        const existing = elementIds.get(element);
        if (existing) return existing;
        const assigned =
          typeof globalObj?.crypto?.randomUUID === 'function'
            ? globalObj.crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`;
        elementIds.set(element, assigned);
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
            const docRef = globalObj.document;
            const candidates = labelledBy
              .split(/\s+/)
              .map((id) => {
                if (!docRef || typeof docRef.getElementById !== 'function') return null;
                const node = docRef.getElementById(id);
                return node && typeof (node as any).innerText === 'string' ? (node as any).innerText.trim() : null;
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

      const interactiveTags = new Set(['input', 'button', 'select', 'textarea', 'a']);

      const asElement = (value: any) =>
        value && typeof value === 'object' && typeof value.tagName === 'string' ? value : null;

      const resolveInteractiveTarget = (event: any): any => {
        if (!event) return null;
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
        for (const entry of path) {
          const element = asElement(entry);
          if (!element) continue;
          const tag = element.tagName.toLowerCase();
          if (interactiveTags.has(tag)) return element;
          if (tag === 'label' && element.control) return element.control;
        }

        const rawTarget = asElement(event.target);
        if (rawTarget) {
          const tag = rawTarget.tagName.toLowerCase();
          if (interactiveTags.has(tag)) return rawTarget;
          if (tag === 'label' && rawTarget.control) return rawTarget.control;
          if (typeof rawTarget.closest === 'function') {
            const relatedLabel = rawTarget.closest('label');
            if (relatedLabel && relatedLabel.control) return relatedLabel.control;
          }
        }

        return event.target ?? null;
      };

      globalObj.addEventListener(
        'click',
        (event: any) => {
          const target = resolveInteractiveTarget(event);
          if (!target) return;
          const descriptor = serializeElement(target);
          send('click', descriptor, {
            button: typeof event?.button === 'number' ? event.button : 0,
            detail: typeof event?.detail === 'number' ? event.detail : 0,
            clientX: typeof event?.clientX === 'number' ? event.clientX : null,
            clientY: typeof event?.clientY === 'number' ? event.clientY : null,
          });
        },
        { passive: true },
      );

      globalObj.addEventListener(
        'change',
        (event: any) => {
          const target = resolveInteractiveTarget(event);
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
        },
        { passive: true },
      );

      globalObj.addEventListener(
        'input',
        (event: any) => {
          const target = resolveInteractiveTarget(event);
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
        },
        { passive: true },
      );

      globalObj.addEventListener(
        'submit',
        (event: any) => {
          const target = resolveInteractiveTarget(event);
          if (!target) return;
          const descriptor = serializeElement(target);
          send('submit', descriptor, {});
        },
        { passive: true },
      );

      globalObj.addEventListener(
        'keydown',
        (event: any) => {
          const key = typeof event?.key === 'string' ? event.key : '';
          if (key.toLowerCase() !== 'enter') return;
          const target = resolveInteractiveTarget(event);
          if (!target) return;
          const descriptor = serializeElement(target);
          send('keydown', descriptor, { key });
        },
        { passive: true },
      );
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

  if (options.baseUrl) {
    await page.goto(options.baseUrl, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(200).catch(() => undefined);
    await recordNavigationEvent({
      page,
      screenshotsDir,
      flowStream,
      nextIndex: consumeActionIndex,
      url: page.url(),
      title: 'Initial load',
      captureOptions: { waitFor: null, delay: 200 },
    });
    await markPageReady(page);
    await page.waitForTimeout(80).catch(() => undefined);
  } else {
    await markPageReady(page);
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
  captureOptions?: CaptureOptions;
  originActionIndex?: number;
}

async function recordNavigationEvent({
  page,
  screenshotsDir,
  flowStream,
  nextIndex,
  url,
  title,
  captureOptions,
  originActionIndex,
}: NavigationRecordOptions) {
  const actionIndex = nextIndex();
  const screenshotFile = await captureActionScreenshot(
    page,
    screenshotsDir,
    actionIndex,
    captureOptions ?? { waitFor: 'load', delay: 320 },
  );

  const entry: RecordedActionLogEntry = {
    kind: 'route',
    ts: Date.now(),
    pageUrl: url,
    descriptor: null,
    meta: {
      title,
      ...(typeof originActionIndex === 'number' ? { originActionIndex } : {}),
    },
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
    if (waitFor === null) {
      // no-op, caller already awaited desired state
    } else if (waitFor) {
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

async function markPageReady(page: Page) {
  try {
    await page.evaluate(() => {
      const target = globalThis as any;
      if (typeof target?.dispatchEvent === 'function') {
        const EventCtor = target.Event || target.CustomEvent;
        if (EventCtor) {
          target.dispatchEvent(new EventCtor('__testrun-recorder-ready'));
        }
      }
    });
  } catch (error) {
    console.debug('Recorder ready event dispatch skipped', error);
  }
}
