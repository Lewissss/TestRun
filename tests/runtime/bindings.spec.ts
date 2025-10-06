import { test, expect } from '@playwright/test';
import { resolveBindings } from '../../app/shared/runtime/bindings';

test('resolve simple bindings', async () => {
  process.env.TEST_EMAIL = 'user@example.com';
  process.env.SECRET_API_KEY = 'super-secret';

  const resolved = resolveBindings(
    {
      email: '${ENV:TEST_EMAIL}',
      apiKey: '${SECRET:API_KEY}',
      token: '${RAND:hex8}',
      literal: 'hello',
    },
    { dataset: { plan: 'pro' } },
  );

  expect(resolved.email).toBe('user@example.com');
  expect(resolved.apiKey).toBe('super-secret');
  expect(typeof resolved.token).toBe('string');
  expect((resolved.token as string).length).toBe(8);
  expect(resolved.literal).toBe('hello');
});

test('resolve dataset binding', async () => {
  const resolved = resolveBindings({ level: '${DATA:plan}' }, { dataset: { plan: 'enterprise' } });
  expect(resolved.level).toBe('enterprise');
});
