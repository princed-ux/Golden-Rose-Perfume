import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { normalizeTheme } from './theme-provider';

describe('Theme preference safety', () => {
  it('restores supported explicit preferences', () => {
    assert.equal(normalizeTheme('light'), 'light');
    assert.equal(normalizeTheme('dark'), 'dark');
    assert.equal(normalizeTheme('system'), 'system');
  });
  it('uses system preference for absent, corrupt or unexpected stored values', () => {
    for (const value of [null, undefined, '', 'auto', 'DARK', {}, 1]) assert.equal(normalizeTheme(value), 'system');
  });
});
