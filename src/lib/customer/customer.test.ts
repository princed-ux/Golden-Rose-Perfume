import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { resolveAuthOrigin, validNewPassword } from './auth-policy';
import { createWhatsAppLink, mergeBagLines, normalizeWhatsAppNumber, parseBag, resolveBag, setBagQuantity } from './bag';
import { productImageUrl, PRODUCT_IMAGE_PREFIX } from '../golden-rose/product-images';
import { isAmaraPage } from './amara';
import type { CatalogProduct } from '../golden-rose/contracts';

const id = '00000000-0000-4000-8000-000000000001';
const product: CatalogProduct = {
  id: '00000000-0000-4000-8000-000000000002', slug: 'test-fragrance', name: 'Test fragrance',
  brand: null, category: null, description: null,
  variants: [{ id, sku: 'TEST', sizeMl: 50, priceMinor: 150025, currency: 'NGN' }],
};

test('guest bag imports keep distinct variants and do not double quantities on retry', () => {
  const incoming = [{ variantId: id, quantity: 4 }, { variantId: product.id, quantity: 2 }];
  const result = mergeBagLines([{ variantId: id, quantity: 3 }], incoming);
  assert.deepEqual(result, incoming);
  assert.deepEqual(mergeBagLines(result, incoming), result);
});

test('product photos resolve only to approved raster objects in the catalogue bucket', () => {
  assert.equal(productImageUrl('brand/Rose 50.png'), PRODUCT_IMAGE_PREFIX + 'brand/Rose%2050.png');
  for (const value of ['../rose.png', 'https://example.test/rose.png', '/rose.png', '%2e%2e/rose.png', 'rose.svg', 'rose.png?x=1']) {
    assert.equal(productImageUrl(value), null);
  }
});

test('Amara is only available on storefront and customer routes', () => {
  for (const path of ['/', '/shop/fragrance', '/cart', '/checkout', '/account/wishlist']) assert.equal(isAmaraPage(path), true);
  for (const path of ['/workspace', '/staff/login', '/shop-admin']) assert.equal(isAmaraPage(path), false);
});

test('Auth redirects use configured origin or a valid loopback, never an arbitrary Host', () => {
  assert.equal(resolveAuthOrigin('https://shop.example.test', 'attacker.example.test'), 'https://shop.example.test');
  assert.equal(resolveAuthOrigin(undefined, 'localhost:3117'), 'http://localhost:3117');
  for (const host of ['example.test', 'localhost@evil.test', 'localhost:99999', 'localhost/path']) {
    assert.equal(resolveAuthOrigin(undefined, host), null);
  }
  assert.equal(resolveAuthOrigin('https://shop.example.test/path', 'localhost:3000'), null);
});

test('new passwords require at least eight characters and matching confirmation', () => {
  assert.equal(validNewPassword('1234567', '1234567'), false);
  assert.equal(validNewPassword('12345678', '12345678'), true);
  assert.equal(validNewPassword('12345678', '12345679'), false);
  assert.equal(validNewPassword('a'.repeat(129), 'a'.repeat(129)), false);
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
