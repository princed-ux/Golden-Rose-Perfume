'use client';

import { useSyncExternalStore } from 'react';
import { BAG_KEY, parseBag, type BagLine } from '@/src/lib/customer/bag';

const BAG_EVENT = 'golden-rose-bag-updated';
let fallback = '';
let storageUnavailable = false;

function readSnapshot() {
  if (storageUnavailable) return fallback;
  try { return localStorage.getItem(BAG_KEY) ?? ''; } catch { return fallback; }
}

function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === BAG_KEY || event.key === null) notify();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(BAG_EVENT, notify);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(BAG_EVENT, notify);
  };
}

const serverSnapshot = () => null;

export function useShoppingBag() {
  const raw = useSyncExternalStore(subscribe, readSnapshot, serverSnapshot);
  return { ready: raw !== null, lines: parseBag(raw) };
}

export function updateShoppingBag(change: (lines: BagLine[]) => BagLine[]) {
  const current = parseBag(readSnapshot());
  const updated = change(current);
  if (updated === current) return false;
  fallback = JSON.stringify(updated);
  try {
    localStorage.setItem(BAG_KEY, fallback);
    storageUnavailable = false;
  } catch {
    storageUnavailable = true;
  }
  window.dispatchEvent(new Event(BAG_EVENT));
  return true;
}
