import type { APIRequestContext, TestInfo } from '@playwright/test';
import { expect } from '@playwright/test';
import { performance } from 'node:perf_hooks';
import vm from 'node:vm';

interface ApiAssertionResult {
  description: string;
  passed: boolean;
  message?: string;
}

interface ApiActionLog {
  request: {
    method: string;
    url: string;
    headers?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: unknown;
  };
  response: {
    status: number;
    latencyMs: number;
    headers: Record<string, string>;
    bodyPreview?: string;
    rawBodyText?: string;
    size?: number;
  };
  assertions: ApiAssertionResult[];
  captures: Record<string, unknown>;
}

interface ExecuteContext {
  request: APIRequestContext;
  expect: typeof expect;
  params: Record<string, unknown>;
  ctx: Record<string, unknown>;
  testInfo?: TestInfo;
}

interface ApiActionDefinition {
  method: string;
  url: string;
  headers?: Record<string, unknown> | null;
  query?: Record<string, unknown> | null;
  bodyMode?: 'json' | 'text' | 'form' | 'multipart' | null;
  body?: unknown;
  auth?: Record<string, unknown> | null;
  assertions?: Array<Record<string, unknown>>;
  captures?: Array<{ name: string; expression: string; source: string }>;
  preScript?: string | null;
  postScript?: string | null;
}

interface ExecuteResult {
  captures: Record<string, unknown>;
  logs: ApiActionLog[];
  error?: Error;
}

function toSegments(path: string): string[] {
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function getByPath(payload: unknown, path: string): unknown {
  if (!path) return payload;
  const segments = toSegments(path);
  return segments.reduce<unknown>((acc, segment) => {
    if (acc == null) return undefined;
    if (/^\d+$/.test(segment)) {
      const index = Number(segment);
      if (Array.isArray(acc)) {
        return acc[index];
      }
      return (acc as Record<string, unknown>)[segment];
    }
    if (typeof acc === 'object' && acc !== null && segment in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[segment];
    }
    return undefined;
  }, payload);
}

function createSandbox(scope: Record<string, unknown>) {
  const context = vm.createContext({ ...scope });
  return (expression: string) => {
    try {
      const script = new vm.Script(expression);
      const result = script.runInContext(context, { timeout: 50 });
      return result;
    } catch (error) {
      throw new Error(`Script execution failed: ${(error as Error).message}`);
    }
  };
}

function interpolateValue(value: unknown, scope: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    if (!value.includes('${')) {
      return value;
    }
    return value.replace(/\$\{([^}]+)}/g, (_match, expr) => {
      const evaluator = createSandbox(scope);
      const result = evaluator(expr as string);
      return result == null ? '' : String(result);
    });
  }
  if (Array.isArray(value)) {
    return value.map((item) => interpolateValue(item, scope));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, val]) => [key, interpolateValue(val, scope)]));
  }
  return value;
}

function buildHeaders(raw?: Record<string, unknown> | null): Record<string, string> | undefined {
  if (!raw) return undefined;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value == null) continue;
    result[key] = String(value);
  }
  return result;
}

function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}

export async function executeApiActions(actionsInput: unknown, runtime: ExecuteContext): Promise<ExecuteResult> {
  const actions = Array.isArray(actionsInput) ? (actionsInput as ApiActionDefinition[]) : [];
  const captures: Record<string, unknown> = {};
  const logs: ApiActionLog[] = [];
  let lastError: Error | undefined;

  for (const action of actions) {
    const scope = {
      params: runtime.params,
      ctx: runtime.ctx,
      captures,
    };
    const method = (action.method ?? 'GET').toUpperCase();
    const url = String(interpolateValue(action.url ?? '', scope));
    const headers = buildHeaders(interpolateValue(action.headers ?? {}, scope) as Record<string, unknown>);
    const query = interpolateValue(action.query ?? {}, scope) as Record<string, unknown>;
    const requestLog: ApiActionLog['request'] = {
      method,
      url,
      headers,
      query,
    };

    const requestOptions: Record<string, unknown> = {};
    if (headers && Object.keys(headers).length) {
      requestOptions.headers = headers;
    }
    if (query && Object.keys(query).length) {
      requestOptions.params = query;
    }

    if (action.bodyMode === 'json') {
      const rawBody = interpolateValue(action.body ?? {}, scope);
      if (typeof rawBody === 'string') {
        try {
          requestOptions.data = JSON.parse(rawBody);
        } catch (error) {
          throw new Error(`Failed to parse JSON body: ${(error as Error).message}`);
        }
      } else {
        requestOptions.data = rawBody;
      }
      if (!requestOptions.headers) requestOptions.headers = {};
      (requestOptions.headers as Record<string, string>)['content-type'] = 'application/json';
      requestLog.body = requestOptions.data;
    } else if (action.bodyMode === 'text') {
      const rendered = interpolateValue(action.body ?? '', scope);
      requestOptions.data = typeof rendered === 'string' ? rendered : JSON.stringify(rendered);
      requestLog.body = requestOptions.data;
    } else if (action.bodyMode === 'form') {
      const rendered = interpolateValue(action.body ?? {}, scope);
      requestOptions.form = rendered;
      requestLog.body = rendered;
    } else if (action.bodyMode === 'multipart') {
      const rendered = interpolateValue(action.body ?? {}, scope);
      requestOptions.multipart = rendered;
      requestLog.body = rendered;
    }

    if (action.auth && typeof action.auth === 'object') {
      requestOptions.httpCredentials = action.auth;
    }

    let actionError: Error | undefined;

    if (action.preScript) {
      try {
        const evaluator = createSandbox({ params: runtime.params, ctx: runtime.ctx, request: requestOptions, captures });
        evaluator(action.preScript);
      } catch (error) {
        if (!actionError) {
          actionError = error as Error;
        }
      }
    }

    const started = performance.now();
    const methodKey = method.toLowerCase();
    const apiContext = runtime.request as Record<string, any>;
    const executor = typeof apiContext[methodKey] === 'function' ? apiContext[methodKey].bind(apiContext) : apiContext.get.bind(apiContext);
    const response = await executor(url, { ...requestOptions });
    const latencyMs = Math.round(performance.now() - started);
    const status = response.status();
    const headersObj = normalizeHeaders(response.headers());
    const bodyBuffer = await response.body();
    const bodyText = bodyBuffer.toString('utf8');
    let jsonBody: unknown;
    if (bodyText) {
      try {
        jsonBody = JSON.parse(bodyText);
      } catch {
        jsonBody = undefined;
      }
    }

    const assertions: ApiAssertionResult[] = [];
    const runExpectation = (fn: () => void, description: string) => {
      try {
        fn();
        assertions.push({ description, passed: true });
      } catch (error) {
        assertions.push({ description, passed: false, message: (error as Error).message });
        if (!actionError) {
          actionError = error as Error;
        }
      }
    };

    for (const assertion of action.assertions ?? []) {
      const type = assertion.type as string;
      if (type === 'status') {
        const operator = (assertion.operator as string) ?? 'equals';
        const value = assertion.value;
        if (operator === 'equals') {
          runExpectation(() => runtime.expect(status).toBe(Number(value)), `status == ${value}`);
        } else if (operator === 'between' && Array.isArray(value)) {
          runExpectation(() => {
            runtime.expect(status).toBeGreaterThanOrEqual(Number(value[0]));
            runtime.expect(status).toBeLessThanOrEqual(Number(value[1]));
          }, `status between ${value.join('..')}`);
        } else if (operator === 'lt') {
          runExpectation(() => runtime.expect(status).toBeLessThan(Number(value)), `status < ${value}`);
        } else if (operator === 'lte') {
          runExpectation(() => runtime.expect(status).toBeLessThanOrEqual(Number(value)), `status <= ${value}`);
        } else if (operator === 'gt') {
          runExpectation(() => runtime.expect(status).toBeGreaterThan(Number(value)), `status > ${value}`);
        } else if (operator === 'gte') {
          runExpectation(() => runtime.expect(status).toBeGreaterThanOrEqual(Number(value)), `status >= ${value}`);
        }
      } else if (type === 'header') {
        const name = String(assertion.name ?? '').toLowerCase();
        const actual = headersObj[name];
        const operator = (assertion.operator as string) ?? 'equals';
        const value = assertion.value;
        if (operator === 'equals') {
          runExpectation(() => runtime.expect(actual).toBe(String(value ?? '')), `header ${name} equals ${value}`);
        } else if (operator === 'contains') {
          runExpectation(() => runtime.expect(actual ?? '').toContain(String(value ?? '')), `header ${name} contains ${value}`);
        } else if (operator === 'matches') {
          const regex = new RegExp(String(value ?? ''));
          runExpectation(() => runtime.expect(actual ?? '').toMatch(regex), `header ${name} matches ${value}`);
        }
      } else if (type === 'jsonPath') {
        const path = String(assertion.path ?? '');
        const operator = (assertion.operator as string) ?? 'exists';
        const value = assertion.value;
        const actual = getByPath(jsonBody, path);
        if (operator === 'exists') {
          runExpectation(() => runtime.expect(actual).not.toBeUndefined(), `json.path(${path}) exists`);
        } else if (operator === 'notExists') {
          runExpectation(() => runtime.expect(actual).toBeUndefined(), `json.path(${path}) not exists`);
        } else if (operator === 'equals') {
          runExpectation(() => runtime.expect(actual).toEqual(value), `json.path(${path}) equals`);
        } else if (operator === 'contains') {
          runExpectation(() => runtime.expect(String(actual ?? '')).toContain(String(value ?? '')), `json.path(${path}) contains ${value}`);
        } else if (operator === 'length') {
          runExpectation(() => runtime.expect((actual as { length?: number })?.length ?? 0).toBe(Number(value ?? 0)), `json.path(${path}) length == ${value}`);
        }
      } else if (type === 'bodyText') {
        const operator = (assertion.operator as string) ?? 'contains';
        const value = assertion.value;
        if (operator === 'equals') {
          runExpectation(() => runtime.expect(bodyText).toBe(String(value ?? '')), `bodyText equals ${value}`);
        } else if (operator === 'contains') {
          runExpectation(() => runtime.expect(bodyText).toContain(String(value ?? '')), `bodyText contains ${value}`);
        } else if (operator === 'matches') {
          const regex = new RegExp(String(value ?? ''));
          runExpectation(() => runtime.expect(bodyText).toMatch(regex), `bodyText matches ${value}`);
        }
      }
    }

    const captureResults: Record<string, unknown> = {};
    for (const capture of action.captures ?? []) {
      if (!capture?.name) continue;
      let captured: unknown;
      if (capture.source === 'jsonPath') {
        captured = getByPath(jsonBody, capture.expression ?? '');
      } else if (capture.source === 'header') {
        captured = headersObj[(capture.expression ?? '').toLowerCase()];
      } else if (capture.source === 'bodyText') {
        captured = bodyText;
      }
      runtime.ctx[capture.name] = captured;
      captures[capture.name] = captured;
      captureResults[capture.name] = captured;
    }

    if (action.postScript) {
      try {
        const evaluator = createSandbox({
          params: runtime.params,
          ctx: runtime.ctx,
          response: { status, headers: headersObj, bodyText, json: jsonBody },
          captures,
        });
        evaluator(action.postScript);
      } catch (error) {
        if (!actionError) {
          actionError = error as Error;
        }
      }
    }

    const bodyPreview = bodyText.length > 4096 ? `${bodyText.slice(0, 4096)}…` : bodyText;

    logs.push({
      request: requestLog,
      response: {
        status,
        latencyMs,
        headers: headersObj,
        bodyPreview,
        rawBodyText: bodyText,
        size: bodyBuffer.length,
      },
      assertions,
      captures: captureResults,
    });

    if (actionError) {
      lastError = actionError;
    }
  }

  return { captures, logs, error: lastError };
}
