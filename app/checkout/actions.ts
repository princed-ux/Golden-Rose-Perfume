'use server';

import { listCatalog } from '@/src/lib/golden-rose/edge';
import { createWhatsAppLink, getWhatsAppNumber, parseBag, resolveBag } from '@/src/lib/customer/bag';
import { validEmail } from '@/src/lib/customer/auth-policy';

function text(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export async function prepareCheckout(form: FormData) {
  const number = getWhatsAppNumber();
  if (!number) return { error: 'The store’s WhatsApp number is not configured yet.' };

  const lines = parseBag(text(form, 'bag'));
  if (!lines.length) return { error: 'Add a fragrance to your bag first.' };

  const contact = {
    name: text(form, 'name'), phone: text(form, 'phone'),
    email: text(form, 'email'), delivery: text(form, 'delivery'),
  };
  if (!contact.name || contact.name.length > 120 ||
      !/^\+?[\d ()-]{7,30}$/.test(contact.phone) || contact.phone.replace(/\D/g, '').length < 7 ||
      contact.phone.replace(/\D/g, '').length > 15 ||
      (contact.email && !validEmail(contact.email)) || contact.delivery.length > 240) {
    return { error: 'Check your name, phone number, email and delivery details.' };
  }

  try {
    const { items, unavailable, totalMinor } = resolveBag(lines, await listCatalog());
    if (unavailable.length) return { error: 'An item is no longer available. Review your bag before continuing.' };
    if (totalMinor === null) return { error: 'The estimated total could not be calculated. Reduce the bag quantity.' };
    const href = createWhatsAppLink(number, items, totalMinor, contact);
    return href ? { href, totalMinor } : { error: 'Your message is too long. Shorten the delivery details or split the bag.' };
  } catch {
    return { error: 'Current prices could not be checked. Try again before opening WhatsApp.' };
  }
}
