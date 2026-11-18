export type CustomerAuthMode = 'login' | 'register' | 'forgot-password' | 'reset-password';

export interface AuthResult {
  message: string;
  error?: boolean;
}

export const INITIAL_AUTH_RESULT: AuthResult = { message: '' };
export const RECOVERY_COOKIE = 'gr-password-recovery';
export const MIN_NEW_PASSWORD_LENGTH = 8;
export const NEW_PASSWORD_HINT = `Use at least ${MIN_NEW_PASSWORD_LENGTH} characters.`;
// Supabase Auth uses bcrypt, which only supports up to 72 UTF-8 bytes.
const MAX_PASSWORD_BYTES = 72;

export function resolveAuthOrigin(siteUrl: string | undefined, host: string | null): string | null {
  if (siteUrl?.trim()) {
    try {
      const url = new URL(siteUrl.trim());
      if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
      if (url.protocol === 'https:' || (url.protocol === 'http:' && isLoopback(url.host))) return url.origin;
    } catch { /* Invalid site configuration. */ }
    return null;
  }
  return host && isLoopback(host) ? new URL('http://' + host).origin : null;
}

function isLoopback(host: string) {
  return /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host) &&
    URL.canParse('http://' + host);
}

export function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function newPasswordError(value: string, confirmation: FormDataEntryValue | null = value): string | null {
  if (value.length < MIN_NEW_PASSWORD_LENGTH) return NEW_PASSWORD_HINT;
  if (new TextEncoder().encode(value).length > MAX_PASSWORD_BYTES) return `Use a password no longer than ${MAX_PASSWORD_BYTES} bytes.`;
  if (value !== confirmation) return 'The passwords do not match.';
  return null;
}
