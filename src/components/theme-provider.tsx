'use client';

import { useEffect, useState, type ReactNode } from 'react';

export const THEME_STORAGE_KEY = 'golden-rose-theme';
export type Theme = 'light' | 'dark' | 'system';
export function normalizeTheme(value: unknown): Theme {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export default function ThemeProvider({ children }: { children: ReactNode }) {
  // The server and first client render always agree. CSS handles system preference.
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    try { setTheme(normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY))); } catch { /* Storage can be unavailable. */ }
    const sync = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) setTheme(normalizeTheme(event.newValue));
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  function chooseTheme(value: string) {
    const selection = normalizeTheme(value);
    setTheme(selection);
    try { localStorage.setItem(THEME_STORAGE_KEY, selection); } catch { /* The current tab can still change theme. */ }
  }
  return (
    <div className="gr-theme-root" data-theme={theme}>
      {children}
      <label className="gr-theme-control"><span>Appearance</span><select aria-label="Color theme" value={theme} onChange={event => chooseTheme(event.target.value)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></label>
    </div>
  );
}
