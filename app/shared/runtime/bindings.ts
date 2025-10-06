import { randomBytes } from 'node:crypto';

export interface BindingContext {
  dataset?: Record<string, unknown> | null;
  variables?: Record<string, unknown> | null;
}

function resolveRandToken(token: string): unknown {
  if (token === 'hex8') {
    return randomBytes(4).toString('hex');
  }
  if (token.startsWith('int:')) {
    const [, range] = token.split(':');
    const [minStr, maxStr] = range.split(',');
    const min = Number.parseInt(minStr ?? '0', 10);
    const max = Number.parseInt(maxStr ?? '1000', 10);
    const value = Math.floor(Math.random() * (max - min + 1)) + min;
    return value;
  }
  return randomBytes(4).toString('hex');
}

function resolveSecretToken(key: string): string {
  const envKey = `SECRET_${key}`;
  if (process.env[envKey]) {
    return process.env[envKey] as string;
  }
  return process.env[key] ?? '';
}

export function resolveBindingValue(value: unknown, context: BindingContext = {}): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  if (!value.startsWith('${') || !value.endsWith('}')) {
    return value;
  }

  const token = value.slice(2, -1);
  if (token.startsWith('ENV:')) {
    const key = token.slice(4);
    return process.env[key] ?? '';
  }
  if (token.startsWith('SECRET:')) {
    const key = token.slice(7);
    return resolveSecretToken(key);
  }
  if (token.startsWith('RAND:')) {
    const randToken = token.slice(5);
    return resolveRandToken(randToken);
  }
  if (token.startsWith('DATA:')) {
    const key = token.slice(5);
    return context.dataset?.[key] ?? '';
  }
  if (token.startsWith('VAR:')) {
    const key = token.slice(4);
    return context.variables?.[key] ?? '';
  }
  return value;
}

export function resolveBindings(bindings: Record<string, unknown>, context: BindingContext = {}): Record<string, unknown> {
  return Object.fromEntries(Object.entries(bindings).map(([key, value]) => [key, resolveBindingValue(value, context)]));
}
