import 'server-only';

import { getSupabaseConfig } from '@/src/lib/supabase/config';
import { normalizeWhatsAppNumber } from './bag';

export interface StoreWhatsAppContact {
  id: string;
  label: string;
  number: string;
  purpose: string;
}

export class StoreContactsUnavailable extends Error {
  constructor() {
    super('Golden Rose contact settings are temporarily unavailable.');
    this.name = 'StoreContactsUnavailable';
  }
}

function contactFrom(value: unknown): StoreWhatsAppContact | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const number = normalizeWhatsAppNumber(typeof row.number === 'string' ? row.number : undefined);
  if (typeof row.id !== 'string' || !number) return null;
  return {
    id: row.id,
    number,
    label: typeof row.label === 'string' && row.label.trim() ? row.label.trim() : 'Golden Rose Perfume',
    purpose: typeof row.purpose === 'string' ? row.purpose : 'orders',
  };
}

/**
 * Reads active contacts from the owner's existing store-contacts Edge Function.
 * The public function returns active numbers only and does not expose staff credentials.
 * A failed read is not treated as an unconfigured store.
 */
export async function getStoreWhatsAppContact(): Promise<StoreWhatsAppContact | null> {
  try {
    const { url, publishableKey } = getSupabaseConfig();
    const endpoint = new URL('functions/v1/store-contacts', url.replace(/\/?$/, '/'));
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { apikey: publishableKey, Accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new StoreContactsUnavailable();

    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new StoreContactsUnavailable();
    }
    const data = payload as Record<string, unknown>;
    if (data.ok !== true || !Array.isArray(data.numbers)) {
      throw new StoreContactsUnavailable();
    }
    if (data.numbers.length === 0) return null;
    const contacts = data.numbers.map(contactFrom).filter(
      (item): item is StoreWhatsAppContact => item !== null
    );
    if (!contacts.length) throw new StoreContactsUnavailable();
    const primaryId = typeof data.primaryId === 'string' ? data.primaryId : null;
    return contacts.find(item => item.id === primaryId) ??
      contacts.find(item => item.purpose === 'orders') ?? contacts[0];
  } catch {
    throw new StoreContactsUnavailable();
  }
}
