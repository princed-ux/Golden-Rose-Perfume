import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { resolveAuthOrigin } from './auth-policy';
import { createWhatsAppLink, normalizeWhatsAppNumber, parseBag, resolveBag, setBagQuantity } from './bag';
import type { CatalogProduct } from '../golden-rose/contracts';

const id = '00000000-0000-4000-8000-000000000001';
const product: CatalogProduct = {
  id: '00000000-0000-4000-8000-000000000002', slug: 'test-fragrance', name: 'Test fragrance',
  brand: null, category: null, description: null,
  variants: [{ id, sku: 'TEST', sizeMl: 50, priceMinor: 150025, currency: 'NGN' }],
};

test('Auth redirects use configured origin or a valid loopback, never an arbitrary Host', () => {
  assert.equal(resolveAuthOrigin('https://shop.example.test', 'attacker.example.test'), 'https://shop.example.test');
  assert.equal(resolveAuthOrigin(undefined, 'localhost:3117'), 'http://localhost:3117');
  for (const host of ['example.test', 'localhost@evil.test', 'localhost:99999', 'localhost/path']) {
    assert.equal(resolveAuthOrigin(undefined, host), null);
  }
  assert.equal(resolveAuthOrigin('https://shop.example.test/path', 'localhost:3000'), null);
});

test('persisted bag strips cached prices and rejects legacy demo IDs', () => {
  const raw = JSON.stringify([
    { variantId: id, quantity: 2, priceMinor: 1 },
    { variantId: 'v-rose-oud-50', quantity: 1 },
  ]);
  const lines = parseBag(raw);
  assert.deepEqual(lines, [{ variantId: id, quantity: 2 }]);
  assert.deepEqual(setBagQuantity(lines, id, 0), []);
  assert.equal(resolveBag(lines, [product]).totalMinor, 300050);
  assert.equal(resolveBag(lines, []).unavailable.length, 1);
});

test('WhatsApp message uses current kobo prices and supplied contact details', () => {
  assert.equal(normalizeWhatsAppNumber(undefined), null);
  assert.equal(normalizeWhatsAppNumber('2348000000000'), null);
  const { items } = resolveBag([{ variantId: id, quantity: 2 }], [product]);
  const link = createWhatsAppLink('12025550100', items, 300050, {
    name: 'Test customer', phone: '+1 202 555 0101', email: 'test@example.test', delivery: '',
  });
  assert.ok(link);
  const url = new URL(link);
  assert.equal(url.origin, 'https://wa.me');
  const message = url.searchParams.get('text')!;
  assert.match(message, /Test fragrance.*50 ml/);
  assert.match(message, /2 × ₦1,500\.25 = ₦3,000\.50/);
  assert.match(message, /Test customer/);
  assert.match(message, /test@example.test/);
});
