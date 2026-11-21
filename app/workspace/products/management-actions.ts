'use server';

import { revalidatePath } from 'next/cache';
import { getStaffAccess } from '@/src/lib/golden-rose/staff';
import { canManageStockSetup } from '@/src/lib/golden-rose/contracts';
import { cataloguePayload, type CatalogueCommand, type CatalogueOperation, type ManagedProduct } from '@/src/lib/golden-rose/catalogue-management';
import { createClient } from '@/src/lib/supabase/server';
import { createProduct, setPublication } from '../actions';
import { catalogueError } from './data';

export async function changeCatalogue(action: CatalogueCommand, form: FormData): Promise<CatalogueOperation> {
  if (action !== 'create' && action !== 'details' && action !== 'variant' && action !== 'publication' && action !== 'channels') {
    return { status: 'error', message: 'Unknown catalogue operation.' };
  }
  const staff = await getStaffAccess();
  if ('reason' in staff || !canManageStockSetup(staff.role)) {
    return { status: 'error', message: 'Only a signed-in owner or manager can change products.' };
  }
  const payload = cataloguePayload(action, form);
  if (!payload.data) return { status: 'error', message: payload.error };

  try {
    const client = await createClient();
    const { data, error } = await client.rpc('gr_manage_catalogue', { p_action: action, p_payload: payload.data });
    if (error?.code === 'PGRST202') {
      // The deployed Edge Function still serves the original create/publish operations.
      if (action === 'create') return createProduct(form);
      if (action === 'publication') return setPublication(form);
    }
    if (error || !data?.productId || !data.revision) {
      return { status: 'error', message: catalogueError(error?.code, error?.message) };
    }
    revalidatePath('/workspace/products');
    revalidatePath('/workspace/inventory');
    revalidatePath('/workspace/pos');
    revalidatePath('/shop');
    revalidatePath('/');
    revalidatePath('/shop/[slug]', 'page');
    const product = data as ManagedProduct;
    const message = action === 'channels'
      ? 'POS and online selling channels saved.'
      : action === 'publication'
        ? (product.published ? 'Product published to the shop.' : 'Product removed from the shop.')
        : action === 'create' ? 'Product created as a draft.' : action === 'variant' ? 'Variant saved.' : 'Product details saved.';
    return { status: 'success', message, productId: product.productId, product };
  } catch {
    return { status: 'error', message: 'Could not confirm the change. Retry this same request or refresh the catalogue.' };
  }
}
