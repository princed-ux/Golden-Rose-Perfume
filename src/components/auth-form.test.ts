import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { validateAuthValues, type AuthValues } from './auth-form';

const valid: AuthValues = { email: 'customer@example.com', password: 'A long passphrase', confirmPassword: 'A long passphrase', inviteCode: 'owner-issued-code' };

describe('Authentication UI validation', () => {
  it('rejects malformed email addresses on every screen', () => {
    for (const mode of ['login', 'register', 'forgot-password', 'staff-login', 'accept-invite'] as const) assert.ok(validateAuthValues(mode, { ...valid, email: 'invalid@' }).email);
  });
  it('requires at least eight characters when creating customer or invited staff credentials', () => {
    for (const mode of ['register', 'accept-invite'] as const) {
      assert.ok(validateAuthValues(mode, { ...valid, password: '1234567', confirmPassword: '1234567' }).password);
      assert.deepEqual(validateAuthValues(mode, { ...valid, password: '12345678', confirmPassword: '12345678' }), {});
    }
  });
  it('rejects mismatched confirmation without changing the password', () => {
    assert.ok(validateAuthValues('register', { ...valid, confirmPassword: valid.password + ' ' }).confirmPassword);
  });
  it('allows recovery requests with an email only', () => {
    assert.deepEqual(validateAuthValues('forgot-password', { email: valid.email, password: '', confirmPassword: '', inviteCode: '' }), {});
  });
  it('does not apply new-password rules to existing login passwords', () => {
    assert.deepEqual(validateAuthValues('login', { ...valid, password: '1234567' }), {});
    assert.deepEqual(validateAuthValues('staff-login', { ...valid, password: '1234567' }), {});
  });
  it('requires an invitation code for staff acceptance', () => {
    assert.ok(validateAuthValues('accept-invite', { ...valid, inviteCode: '   ' }).inviteCode);
  });
  it('accepts locally valid entries without treating them as authenticated', () => {
    assert.deepEqual(validateAuthValues('register', valid), {});
    assert.deepEqual(validateAuthValues('accept-invite', valid), {});
  });
});
