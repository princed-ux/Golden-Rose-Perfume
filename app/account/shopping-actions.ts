'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/src/lib/supabase/server';
import { getCustomer } from '@/src/lib/customer/session';
import { MAX_QUANTITY, parseBag, type BagLine } from '@/src/lib/customer/bag';
import { UUID } from '@/src/lib/golden-rose/contracts';
import { findCatalogProducts } from '@/src/lib/golden-rose/edge';

async function accountBag(
  operation?: (client: Awaited<ReturnType<typeof createClient>>, userId: string) => PromiseLike<{ error: unknown }>,
  expectedAccount?: string,
) {
  try {
    const customer = await getCustomer();
    if (!customer) return { status: 'guest' as const };
    if (expectedAccount && expectedAccount !== customer.id) return { status: 'error' as const };
    const client = await createClient();
    if (operation && (await operation(client, customer.id)).error) throw new Error('Bag operation failed');
    const { data, error } = await client.from('gr_customer_bag').select('variant_id, quantity')
      .eq('user_id', customer.id).order('added_at').order('variant_id');
    if (!operation && error && ['PGRST205', '42P01'].includes(error.code)) {
      return { status: 'device' as const, account: customer.id };
    }
    if (error) throw error;
    const lines: BagLine[] = data.map(row => ({ variantId: row.variant_id, quantity: row.quantity }));
    return { status: 'account' as const, account: customer.id, lines };
  } catch {
    return { status: 'error' as const };
  }
}

export async function loadCustomerBag() {
  return accountBag();
}

export async function mergeCustomerBag(raw: string, account: string) {
  const lines = typeof raw === 'string' ? parseBag(raw) : [];
  return accountBag(lines.length ? client => client.rpc('gr_merge_customer_bag', { p_lines: lines }) : undefined, account);
}

export async function saveBagQuantity(variantId: string, quantity: number, account: string) {
  if (typeof variantId !== 'string' || !UUID.test(variantId) ||
      !Number.isInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY) return { status: 'error' as const };
  return accountBag((client, userId) => quantity === 0
    ? client.from('gr_customer_bag').delete().eq('user_id', userId).eq('variant_id', variantId)
    : client.from('gr_customer_bag').upsert({ user_id: userId, variant_id: variantId, quantity }, { onConflict: 'user_id,variant_id' }), account);
}

export async function loadBagProducts(raw: string) {
  if (typeof raw !== 'string') return null;
  try {
    const ids = parseBag(raw, 1000).map(line => line.variantId);
    return await findCatalogProducts(ids, true);
  } catch {
    return null;
  }
}

export async function changeWishlist(productId: string, saved: boolean) {
  if (typeof productId !== 'string' || !UUID.test(productId) || typeof saved !== 'boolean') {
    return { error: 'This fragrance could not be saved.' };
  }
  try {
    const customer = await getCustomer();
    if (!customer) return { error: 'Sign in to save fragrances.' };
    const client = await createClient();
    if (saved && !(await findCatalogProducts([productId])).length) {
      return { error: 'This fragrance is no longer available.' };
    }
    const { error } = saved
      ? await client.from('gr_customer_wishlist').upsert(
        { user_id: customer.id, product_id: productId }, { onConflict: 'user_id,product_id', ignoreDuplicates: true },
      )
      : await client.from('gr_customer_wishlist').delete().eq('user_id', customer.id).eq('product_id', productId);
    if (error) throw error;
    revalidatePath('/account/wishlist');
    return { saved };
  } catch {
    return { error: 'Saved fragrances are temporarily unavailable. Try again.' };
  }
}
