
'use client';

import {
  useEffect,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from 'react';
import { Moon, Monitor, Sun } from 'lucide-react';
import { normalizeTheme, type Theme } from '../lib/customer/preferences';
import { saveCustomerAppearance } from '@/app/account/appearance-action';

export const THEME_STORAGE_KEY = 'golden-rose-theme';

export { normalizeTheme };
export type { Theme };

const THEME_CHANGE_EVENT = 'golden-rose-theme-updated';

function getThemeSnapshot(): Theme {
  try {
    return normalizeTheme(
      window.localStorage.getItem(THEME_STORAGE_KEY)
    );
  } catch {
    return 'system';
  }
}

function getServerSnapshot(): Theme {
  return 'system';
}

function subscribeToTheme(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(THEME_CHANGE_EVENT, onChange);

  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
  };
}

export function useThemePreference(): Theme {
  return useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerSnapshot
  );
}

export function setThemePreference(value: Theme) {
  const next = normalizeTheme(value);

  try {
    window.localStorage.setItem(
      THEME_STORAGE_KEY,
      next
    );
  } catch {
    // Theme still defaults to system if storage is blocked.
  }

  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function SyncAccountAppearance({ appearance }: { appearance: Theme }) {
  useEffect(() => setThemePreference(appearance), [appearance]);
  return null;
}

export default function ThemeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const theme = useThemePreference();

  return (
    <div
      className="gr-theme-root"
      data-theme={theme}
    >
      {children}
    </div>
  );
}

const preferences = [
  {
    value: 'light',
    label: 'Light',
    description: 'Warm ivory and champagne.',
    Icon: Sun,
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Deep espresso and soft gold.',
    Icon: Moon,
  },
  {
    value: 'system',
    label: 'System',
    description: 'Match your device appearance.',
    Icon: Monitor,
  },
] as const;

export function CustomerThemePreference({ appearance }: { appearance: Theme }) {
  const [theme, setTheme] = useState(appearance);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <fieldset className="grc-theme-picker" disabled={pending} aria-busy={pending}>
      <legend className="grc-theme-picker__title">
        Website appearance
      </legend>

      <p className="grc-theme-picker__description">
        Your appearance preference follows your Golden Rose account.
      </p>

      <div className="grc-theme-picker__grid">
        {preferences.map(({ value, label, description, Icon }) => (
          <label
            key={value}
            className="grc-theme-option"
            data-selected={theme === value}
          >
            <input
              type="radio"
              name="golden-rose-appearance"
              value={value}
              checked={theme === value}
              onChange={() => startTransition(async () => {
                setError(false);
                const saved = await saveCustomerAppearance(value).catch(() => false);
                if (saved) {
                  setTheme(value);
                  setThemePreference(value);
                } else setError(true);
              })}
            />

            <span className="grc-theme-option__icon">
              <Icon size={22} strokeWidth={1.5} />
            </span>

            <strong>{label}</strong>
            <small>{description}</small>

            <span
              aria-hidden="true"
              className="grc-theme-option__check"
            />
          </label>
        ))}
      </div>
      {pending && <p role="status">Saving appearance…</p>}
      {error && <p role="alert">Your appearance could not be saved. Try again.</p>}
    </fieldset>
  );
}
