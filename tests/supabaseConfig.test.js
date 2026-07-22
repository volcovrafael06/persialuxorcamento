import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Supabase client has a safe preview fallback', async () => {
  const source = await readFile(new URL('../src/supabase/client.js', import.meta.url), 'utf8');

  assert.match(source, /ozxpdccutroxtjqcpjea\.supabase\.co/);
  assert.doesNotMatch(source, /placeholder\.supabase\.co/);
  assert.doesNotMatch(source, /service_role|sb_secret_/i);
});
