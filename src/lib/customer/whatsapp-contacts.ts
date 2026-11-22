
import 'server-only';

import { getSupabaseConfig } from '@/src/lib/supabase/config';
import { normalizeWhatsAppNumber } from './bag';

export interface CheckoutWhatsAppContact {
  id: string;
  label: string;
  number: string;
  purpose: string;
}

interface ContactResponse {
  ok?: unknown;
  primaryId?: unknown;
  numbers?: unknown;
}

interface RawContact {
  id?: unknown;
  label?: unknown;
  number?: unknown;
  purpose?: unknown;
  isPrimary?: unknown;
}

export class CheckoutContactUnavailableError extends Error {
  constructor() {
    super(
      'Golden Rose WhatsApp settings are temporarily unavailable.'
    );
    this.name = 'CheckoutContactUnavailableError';
  }
}

function parseContact(value: unknown): CheckoutWhatsAppContact | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const item = value as RawContact;

  if (typeof item.id !== 'string') {
    return null;
  }

  const number = normalizeWhatsAppNumber(
    typeof item.number === 'string' ? item.number : undefined
  );

  if (!number) {
    return null;
  }

  return {
    id: item.id,
    label:
      typeof item.label === 'string' && item.label.trim()
        ? item.label.trim()
        : 'Golden Rose Perfume',
    number,
    purpose:
      typeof item.purpose === 'string'
        ? item.purpose
        : 'orders',
  };
}

/**
 * Reads the owner's active WhatsApp contacts from the
 * deployed public store-contacts Edge Function.
 *
 * This is server-only. No staff identity, service-role
 * key, or privileged database credentials are exposed.
 *
 * Returns null when no active contact is configured.
 * Throws when the contact service cannot be verified.
 */
export async function getCheckoutWhatsAppContact():
  Promise<CheckoutWhatsAppContact | null> {
  try {
    const { url, publishableKey } = getSupabaseConfig();

    const endpoint = new URL(
      'functions/v1/store-contacts',
      url.replace(/\/?$/, '/')
    );

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        apikey: publishableKey,
        Accept: 'application/json',
      },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new CheckoutContactUnavailableError();
    }

    const payload: unknown = await response.json();

    if (!payload || typeof payload !== 'object') {
      throw new CheckoutContactUnavailableError();
    }

    const data = payload as ContactResponse;

    if (data.ok !== true || !Array.isArray(data.numbers)) {
      throw new CheckoutContactUnavailableError();
    }

    if (data.numbers.length === 0) {
      return null;
    }

    const contacts = data.numbers
      .map(parseContact)
      .filter(
        (item): item is CheckoutWhatsAppContact =>
          item !== null
      );

    if (contacts.length === 0) {
      throw new CheckoutContactUnavailableError();
    }

    const primaryId =
      typeof data.primaryId === 'string'
        ? data.primaryId
        : null;

    return (
      contacts.find((item) => item.id === primaryId) ??
      contacts.find((item) => item.purpose === 'orders') ??
      contacts[0]
    );
  } catch {
    throw new CheckoutContactUnavailableError();
  }
}
