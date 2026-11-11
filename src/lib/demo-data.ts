import type { Product } from '@/src/domain';

/** Fictional UI fixtures only — not imported from the client's Odoo account. */
export const featuredProducts: Product[] = [
  {
    id: 'p-rose-oud',
    name: 'Rose & Oud Eau de Parfum',
    brand: 'Golden Rose Preview',
    category: 'Oriental',
    description: 'A warm floral and woody fragrance concept. All details are illustrative.',
    images: [],
    variants: [{ id: 'v-rose-oud-50', productId: 'p-rose-oud', sku: 'DEMO-RO-50', sizeMl: 50, priceMinor: 3850000, currency: 'NGN' }],
    active: true,
  },
  {
    id: 'p-amber-bloom',
    name: 'Amber Bloom',
    brand: 'Golden Rose Preview',
    category: 'Floral',
    description: 'A soft amber and floral fragrance concept. All details are illustrative.',
    images: [],
    variants: [{ id: 'v-amber-bloom-100', productId: 'p-amber-bloom', sku: 'DEMO-AB-100', sizeMl: 100, priceMinor: 5200000, currency: 'NGN' }],
    active: true,
  },
  {
    id: 'p-velvet-musk',
    name: 'Velvet Musk',
    brand: 'Golden Rose Preview',
    category: 'Musk',
    description: 'A clean, warm musk fragrance concept. All details are illustrative.',
    images: [],
    variants: [{ id: 'v-velvet-musk-50', productId: 'p-velvet-musk', sku: 'DEMO-VM-50', sizeMl: 50, priceMinor: 4450000, currency: 'NGN' }],
    active: true,
  },
];

export function formatNaira(minor: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

export const demoMetrics = [
  { label: 'Illustrative sales', value: '₦1.28m', change: 'Sample only', tone: 'rose' },
  { label: 'Illustrative orders', value: '126', change: 'Sample only', tone: 'gold' },
  { label: 'Sample products', value: '248', change: 'Sample only', tone: 'neutral' },
  { label: 'Needs attention', value: '08', change: 'Sample only', tone: 'sage' },
] as const;

