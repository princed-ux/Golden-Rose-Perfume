export type Theme = 'light' | 'dark' | 'system';

export function normalizeTheme(value: unknown): Theme {
  return value === 'light' || value === 'dark' ? value : 'system';
}
