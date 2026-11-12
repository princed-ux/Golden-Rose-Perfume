import { formatPrice, UUID, type CatalogProduct } from '../golden-rose/contracts';

export const BAG_KEY = 'golden-rose:whatsapp-cart:v1';
export const MAX_QUANTITY = 20;
const MAX_LINES = 50;

export interface BagLine { variantId: string; quantity: number }
export interface BagItem extends BagLine {
  name: string;
  slug: string;
  sku: string | null;
  sizeMl: number | null;
  priceMinor: number;
}

export function parseBag(raw: string | null): BagLine[] {
  if (!raw || raw.length > 80_000) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const lines = new Map<string, number>();
    for (const item of data.slice(0, MAX_LINES)) {
      const id = item?.variantId;
      const quantity = item?.quantity;
      if (typeof id === 'string' && UUID.test(id) && Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_QUANTITY) {
        lines.set(id, Math.min(MAX_QUANTITY, (lines.get(id) ?? 0) + quantity));
      }
    }
    return [...lines].map(([variantId, quantity]) => ({ variantId, quantity }));
  } catch {
    return [];
  }
}

export function setBagQuantity(lines: BagLine[], variantId: string, quantity: number) {
  if (!UUID.test(variantId) || !Number.isInteger(quantity)) return lines;
  if (quantity <= 0) return lines.filter(line => line.variantId !== variantId);
  const next = { variantId, quantity: Math.min(MAX_QUANTITY, quantity) };
  if (lines.some(line => line.variantId === variantId)) {
    return lines.map(line => line.variantId === variantId ? next : line);
  }
  return lines.length < MAX_LINES ? [...lines, next] : lines;
}

export function resolveBag(lines: BagLine[], products: CatalogProduct[]) {
  const variants = new Map(products.flatMap(product => product.variants.map(variant =>
    [variant.id, { product, variant }] as const
  )));
  const items: BagItem[] = [];
  const unavailable: BagLine[] = [];
  let totalMinor = 0;

  for (const line of lines) {
    const match = variants.get(line.variantId);
    if (!match || match.variant.currency !== 'NGN' ||
        !Number.isSafeInteger(match.variant.priceMinor) || match.variant.priceMinor < 0) {
      unavailable.push(line);
      continue;
    }
    const { product, variant } = match;
    items.push({
      ...line, name: product.name, slug: product.slug || product.id, sku: variant.sku,
      sizeMl: variant.sizeMl, priceMinor: variant.priceMinor,
    });
    totalMinor += variant.priceMinor * line.quantity;
  }

  return { items, unavailable, totalMinor: Number.isSafeInteger(totalMinor) ? totalMinor : null };
}

export function normalizeWhatsAppNumber(value: string | undefined) {
  const digits = (value ?? '').replace(/[\s()+-]/g, '');
  return /^[1-9]\d{7,14}$/.test(digits) && digits !== '2348000000000' ? digits : null;
}

export function getWhatsAppNumber() {
  return normalizeWhatsAppNumber(process.env.NEXT_PUBLIC_GOLDEN_ROSE_WHATSAPP_NUMBER);
}

export interface CheckoutContact {
  name: string;
  phone: string;
  email: string;
  delivery: string;
}

export function createWhatsAppLink(number: string, items: BagItem[], totalMinor: number, contact: CheckoutContact) {
  const phone = normalizeWhatsAppNumber(number);
  if (!phone || !items.length || !Number.isSafeInteger(totalMinor) || totalMinor < 0) return null;

  const lineText = (text: string) => text.replace(/\s+/g, ' ').trim();
  const description = items.map((item, index) => {
    const variant = [item.sizeMl ? item.sizeMl + ' ml' : '', item.sku ? 'SKU ' + lineText(item.sku) : '']
      .filter(Boolean).join(' · ');
    return (index + 1) + '. ' + lineText(item.name) + (variant ? ' (' + variant + ')' : '') +
      '\n   ' + item.quantity + ' × ' + formatPrice(item.priceMinor) + ' = ' + formatPrice(item.quantity * item.priceMinor);
  });
  const message = [
    'Hello Golden Rose Perfume, I would like to order:',
    ...description,
    'Estimated item total: ' + formatPrice(totalMinor),
    'Customer: ' + lineText(contact.name),
    'Phone: ' + lineText(contact.phone),
    contact.email && 'Email: ' + lineText(contact.email),
    contact.delivery && 'Delivery details: ' + lineText(contact.delivery),
    'Please confirm availability, the final price and delivery.',
  ].filter(Boolean).join('\n\n');
  const url = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message);
  return url.length <= 7500 ? url : null;
}
