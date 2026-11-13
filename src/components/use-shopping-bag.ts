'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { BAG_KEY, MAX_BAG_LINES, mergeBagLines, parseBag, type BagLine } from '@/src/lib/customer/bag';
import { loadCustomerBag, mergeCustomerBag, saveBagQuantity } from '@/app/account/shopping-actions';

const BAG_EVENT = 'golden-rose-bag-updated';
let fallback = '';
let storageUnavailable = false;

function readSnapshot() {
  if (storageUnavailable) return fallback;
  try { return localStorage.getItem(BAG_KEY) ?? ''; } catch { return fallback; }
}

function writeGuestBag(lines: BagLine[]) {
  fallback = JSON.stringify(lines);
  try {
    localStorage.setItem(BAG_KEY, fallback);
    storageUnavailable = false;
  } catch {
    storageUnavailable = true;
  }
  window.dispatchEvent(new Event(BAG_EVENT));
}

function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === BAG_KEY || event.key === null || event.key.startsWith(BAG_KEY + ':')) notify();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(BAG_EVENT, notify);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(BAG_EVENT, notify);
  };
}

const serverSnapshot = () => null;
type BagState = Awaited<ReturnType<typeof loadCustomerBag>>;

async function syncBag() {
  let result = await loadCustomerBag();
  if (result.status !== 'account' && result.status !== 'device') return result;
  const guestRaw = readSnapshot();
  const guest = parseBag(guestRaw);
  const key = BAG_KEY + ':' + result.account;
  const deviceRaw = localStorage.getItem(key);
  const device = parseBag(deviceRaw, 1000);
  const combined = mergeBagLines(device, guest);

  if (result.status === 'device') {
    if (guest.length) {
      localStorage.setItem(key, JSON.stringify(combined));
      if (readSnapshot() === guestRaw) writeGuestBag([]);
    }
    return result;
  }

  const account = result.account;
  for (let offset = 0; offset < combined.length; offset += MAX_BAG_LINES) {
    result = await mergeCustomerBag(JSON.stringify(combined.slice(offset, offset + MAX_BAG_LINES)), account);
    if (result.status !== 'account') return { status: 'error' as const };
  }
  if (deviceRaw && localStorage.getItem(key) === deviceRaw) localStorage.removeItem(key);
  if (guest.length && readSnapshot() === guestRaw) writeGuestBag([]);
  return result;
}

export function useShoppingBag() {
  const raw = useSyncExternalStore(subscribe, readSnapshot, serverSnapshot);
  const [state, setState] = useState<BagState | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const deviceKey = state?.status === 'device' ? BAG_KEY + ':' + state.account : null;
  const deviceSnapshot = useCallback(() => {
    try { return deviceKey ? localStorage.getItem(deviceKey) : null; } catch { return null; }
  }, [deviceKey]);
  const deviceRaw = useSyncExternalStore(subscribe, deviceSnapshot, serverSnapshot);

  useEffect(() => {
    let current = true;
    syncBag().then(result => { if (current) setState(result); }, () => {
      if (current) setState({ status: 'error' });
    });
    return () => { current = false; };
  }, [revision]);

  const lines = state?.status === 'account' ? state.lines : deviceKey ? parseBag(deviceRaw, 1000) : parseBag(raw);

  async function update(change: (current: BagLine[]) => BagLine[], variantId: string) {
    if (!state || pending || state.status === 'error') return false;
    const current = state.status === 'guest' ? parseBag(readSnapshot()) : lines;
    const updated = change(current);
    if (updated === current) return false;
    setError('');
    if (state.status === 'guest') {
      writeGuestBag(updated);
      return true;
    }
    if (state.status === 'device') {
      try {
        localStorage.setItem(BAG_KEY + ':' + state.account, JSON.stringify(updated));
        window.dispatchEvent(new Event(BAG_EVENT));
        return true;
      } catch {
        setError('This device could not save your bag. Try again.');
        return false;
      }
    }
    setPending(true);
    try {
      const result = await saveBagQuantity(variantId, updated.find(line => line.variantId === variantId)?.quantity ?? 0, state.account);
      if (result.status !== 'account') {
        if (result.status === 'guest') setState({ status: 'error' });
        throw new Error('Bag update failed');
      }
      setState(result);
      return true;
    } catch {
      setError('Your bag could not be updated. Try again.');
      return false;
    } finally {
      setPending(false);
    }
  }

  const retry = useCallback(() => {
    setError('');
    setState(null);
    setRevision(value => value + 1);
  }, []);

  return {
    ready: state !== null && raw !== null,
    unavailable: state?.status === 'error',
    deviceOnly: state?.status === 'device',
    lines, update, pending, error, retry,
  };
}
