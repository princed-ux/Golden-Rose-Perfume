
'use server';

import { findCatalogProducts } from '@/src/lib/golden-rose/edge';
import { createClient } from '@/src/lib/supabase/server';

import {
  createWhatsAppLink,
  MAX_BAG_LINES,
  parseBag,
  resolveBag,
  type BagItem,
} from '@/src/lib/customer/bag';

import { validEmail } from '@/src/lib/customer/auth-policy';

import {
  getCheckoutWhatsAppContact,
} from '@/src/lib/customer/whatsapp-contacts';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REFERENCE = /^GR-WA-[0-9]{7,20}$/;

type CheckoutResult =
  | {
      error: string;
      href?: never;
      reference?: never;
      totalMinor?: never;
    }
  | {
      href: string;
      reference: string;
      totalMinor: number;
      error?: never;
    };

function text(form: FormData, key: string): string {
  const value = form.get(key);

  return typeof value === 'string'
    ? value.trim()
    : '';
}

function savedBagItem(value: unknown): value is BagItem {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const item = value as Partial<BagItem>;

  return (
    typeof item.variantId === 'string' &&
    UUID.test(item.variantId) &&
    typeof item.name === 'string' &&
    item.name.length > 0 &&
    typeof item.slug === 'string' &&
    Number.isSafeInteger(item.quantity) &&
    (item.quantity ?? 0) >= 1 &&
    (item.quantity ?? 0) <= 20 &&
    Number.isSafeInteger(item.priceMinor) &&
    (item.priceMinor ?? -1) >= 0 &&
    (
      item.sizeMl === null ||
      (
        typeof item.sizeMl === 'number' &&
        Number.isFinite(item.sizeMl)
      )
    ) &&
    (
      item.sku === null ||
      typeof item.sku === 'string'
    )
  );
}

function withEnquiryReference(
  href: string,
  reference: string,
): string | null {
  try {
    const url = new URL(href);

    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'wa.me'
    ) {
      return null;
    }

    const message = url.searchParams.get('text');

    if (!message) {
      return null;
    }

    url.searchParams.set(
      'text',
      `${message}\n\nEnquiry reference: ${reference}\nPlease include this reference in your reply.`,
    );

    const linked = url.toString();

    return linked.length <= 7500 ? linked : null;
  } catch {
    return null;
  }
}

/**
 * Preparing checkout saves an ENQUIRY.
 *
 * It does not create a paid sale, verify payment,
 * reserve stock, or confirm that WhatsApp was sent.
 *
 * Product visibility, quantities and prices are
 * revalidated inside the database RPC.
 */
export async function prepareCheckout(
  form: FormData,
): Promise<CheckoutResult> {
  const lines = parseBag(
    text(form, 'bag'),
    MAX_BAG_LINES + 1,
  );

  if (!lines.length) {
    return {
      error: 'Add a fragrance to your bag first.',
    };
  }

  if (lines.length > MAX_BAG_LINES) {
    return {
      error:
        'Reduce the number of fragrances in your bag before continuing.',
    };
  }

  const requestKey = text(form, 'requestKey');

  if (!UUID.test(requestKey)) {
    return {
      error:
        'Your checkout session is outdated. Refresh and prepare your enquiry again.',
    };
  }

  const contact = {
    name: text(form, 'name'),
    phone: text(form, 'phone'),
    email: text(form, 'email'),
    delivery: text(form, 'delivery'),
  };

  if (
    !contact.name ||
    contact.name.length > 120 ||
    !/^\+?[\d ()-]{7,30}$/.test(contact.phone) ||
    contact.phone.replace(/\D/g, '').length < 7 ||
    contact.phone.replace(/\D/g, '').length > 15 ||
    (contact.email && !validEmail(contact.email)) ||
    contact.delivery.length > 240
  ) {
    return {
      error:
        'Check your name, phone number, email and delivery details.',
    };
  }

  let destination;

  try {
    destination = await getCheckoutWhatsAppContact();
  } catch {
    return {
      error:
        'Golden Rose WhatsApp checkout is temporarily unavailable. Please try again.',
    };
  }

  if (!destination) {
    return {
      error:
        'The store has not configured an active WhatsApp checkout contact.',
    };
  }

  let resolved: ReturnType<typeof resolveBag>;

  try {
    const products = await findCatalogProducts(
      lines.map((line) => line.variantId),
      true,
    );

    resolved = resolveBag(lines, products);
  } catch {
    return {
      error:
        'Current prices could not be checked. Please retry.',
    };
  }

  if (resolved.unavailable.length) {
    return {
      error:
        'An item is no longer available. Review your bag before continuing.',
    };
  }

  if (resolved.totalMinor === null) {
    return {
      error:
        'The estimated total could not be calculated. Reduce the bag quantity.',
    };
  }

  const previewHref = createWhatsAppLink(
    destination.number,
    resolved.items,
    resolved.totalMinor,
    contact,
  );

  if (!previewHref || previewHref.length > 7200) {
    return {
      error:
        'Your WhatsApp message is too long. Shorten the delivery details or split your bag.',
    };
  }

  try {
    const client = await createClient();

    const { data, error } = await client.rpc(
      'gr_whatsapp_enquiry_create',
      {
        p_payload: {
          ...contact,
          requestKey,
          items: lines,
        },
      },
    );

    if (error) {
      if (
        ['PGRST202', '42883'].includes(error.code ?? '')
      ) {
        return {
          error:
            'Enquiry tracking is not installed yet. Ask the administrator to apply the WhatsApp enquiries migration.',
        };
      }

      if (error.code === 'P0001') {
        return {
          error:
            'This contact has reached the enquiry limit. Please contact the store directly.',
        };
      }

      if (error.code === '23505') {
        return {
          error:
            'The enquiry reference was reused. Refresh checkout and try again.',
        };
      }

      if (error.code === '22023') {
        return {
          error:
            'Your selection or contact details changed. Review the bag and retry.',
        };
      }

      return {
        error:
          'Your enquiry could not be recorded. Nothing has been charged. Please retry.',
      };
    }

    const saved = data as {
      reference?: unknown;
      totalMinor?: unknown;
      status?: unknown;
      items?: unknown;
    } | null;

    if (
      !saved ||
      typeof saved.reference !== 'string' ||
      !REFERENCE.test(saved.reference) ||
      saved.status !== 'prepared' ||
      !Number.isSafeInteger(saved.totalMinor) ||
      typeof saved.totalMinor !== 'number' ||
      saved.totalMinor < 0 ||
      !Array.isArray(saved.items) ||
      saved.items.length !== lines.length ||
      !saved.items.every(savedBagItem)
    ) {
      return {
        error:
          'The enquiry response could not be verified. Check My Orders before trying again.',
      };
    }

    const currentHref = createWhatsAppLink(
      destination.number,
      saved.items,
      saved.totalMinor,
      contact,
    );

    const href =
      currentHref &&
      withEnquiryReference(
        currentHref,
        saved.reference,
      );

    if (!href) {
      return {
        error:
          `Enquiry ${saved.reference} was saved, but its WhatsApp link is too long. Please shorten the details before retrying.`,
      };
    }

    return {
      href,
      reference: saved.reference,
      totalMinor: saved.totalMinor,
    };
  } catch {
    return {
      error:
        'Could not reach order enquiries. No payment was made. Check your connection and retry.',
    };
  }
}
