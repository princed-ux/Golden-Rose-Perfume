import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('product selling channels retain imported POS eligibility independently of web publication', () => {
  const sql = read('docs/sql/product-sales-channels.sql');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS pos_enabled boolean NOT NULL DEFAULT true/i);
  assert.match(sql, /'published',p\.is_published,'posEnabled',p\.pos_enabled/);
  assert.match(sql, /pos_enabled=sell_in_pos,/);
  assert.match(sql, /is_published=publish_online,/);
  assert.match(sql, /prior\.fingerprint<>fingerprint OR prior\.action<>'channels'/);
  assert.match(sql, /product\.updated_at IS DISTINCT FROM/);
  assert.match(sql, /p\.pos_enabled[\s\S]*?AND v\.is_active/);
});

test('online-only products are hidden at POS and rejected atomically at checkout', () => {
  const sql = read('docs/sql/product-sales-channels.sql');
  assert.match(sql, /CREATE TRIGGER golden_rose_pos_channel_guard/);
  assert.match(sql, /BEFORE INSERT ON golden_rose\.pos_sale_lines/);
  assert.match(sql, /p\.pos_enabled AND p\.is_active AND v\.is_active/);
  assert.match(sql, /RAISE EXCEPTION 'This perfume is not available for in-store POS sales\.'/);
  assert.match(sql, /LIMIT page_limit\+1 OFFSET page_offset/);
  assert.match(sql, /p_action='checkout'[\s\S]*?gr_pos_checked_checkout/);
  const edge = read('supabase/functions/pos-register/index.ts');
  assert.match(edge, /issue\.code === "GR409"/);
});

test('sales-channel settings are exposed only through authenticated catalogue changes', () => {
  const sql = read('docs/sql/product-sales-channels.sql');
  assert.match(sql, /CREATE FUNCTION golden_rose_catalogue\.set_channels/);
  assert.match(sql, /FROM auth\.sessions WHERE id=session_id_claim AND user_id=actor/);
  assert.match(sql, /s\.role='owner'/);
  assert.match(sql, /staff_role NOT IN \('owner','manager'\)/);
  const editor = read('app/workspace/products/product-editor.tsx');
  assert.match(editor, /name="posEnabled"/);
  assert.match(editor, /name="published"/);
  const contract = read('src/lib/golden-rose/catalogue-management.ts');
  assert.match(contract, /action === 'channels'/);
  assert.match(contract, /posEnabled: boolean/);
});

test('customer checkout and homepage contact the owner-configured WhatsApp service', () => {
  const contact = read('src/lib/customer/whatsapp-contacts.ts');
  assert.match(contact, /functions\/v1\/store-contacts/);
  assert.match(contact, /cache: 'no-store'/);
  assert.match(contact, /primaryId/);
  const checkout = read('app/checkout/actions.ts');
  const page = read('app/checkout/page.tsx');
  const home = read('app/page.tsx');
  assert.match(checkout, /getStoreWhatsAppContact/);
  assert.match(page, /getStoreWhatsAppContact/);
  assert.match(home, /getStoreWhatsAppContact/);
  assert.doesNotMatch(checkout, /getWhatsAppNumber/);
  assert.doesNotMatch(page, /getWhatsAppNumber/);
});

test('owner analytics exclude staff and keep customer records private', () => {
  const sql = read('docs/sql/product-sales-channels.sql');
  assert.match(sql, /CREATE FUNCTION golden_rose_catalogue\.customer_counts/);
  assert.match(sql, /s\.role='owner' AND s\.status='active'/);
  assert.match(sql, /NOT EXISTS\(SELECT 1 FROM golden_rose\.staff_members s WHERE s\.user_id=u\.id\)/);
  assert.match(sql, /NOT coalesce\(u\.is_anonymous,false\)/);
  assert.match(sql, /'productChannels',\(/);
  assert.match(sql, /'posOnly',count\(\*\) FILTER\(WHERE is_active AND pos_enabled AND NOT is_published\)/);
  assert.match(sql, /'onlineOnly',count\(\*\) FILTER\(WHERE is_active AND NOT pos_enabled AND is_published\)/);
  const overview = read('app/workspace/page.tsx');
  assert.match(overview, /gr_owner_customer_counts/);
  assert.match(overview, /Sales-channel metrics awaiting database upgrade/);
  assert.match(overview, /role === 'owner' && \(/);
});
