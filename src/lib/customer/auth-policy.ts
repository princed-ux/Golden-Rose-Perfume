export type CustomerAuthMode = 'login' | 'register' | 'forgot-password' | 'reset-password';

export interface AuthResult {
  message: string;
  error?: boolean;
}

export const INITIAL_AUTH_RESULT: AuthResult = { message: '' };
export const RECOVERY_COOKIE = 'gr-password-recovery';

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

export function validNewPassword(value: string, confirmation: string) {
  return value.length >= 12 && value.length <= 128 && value === confirmation;
}
