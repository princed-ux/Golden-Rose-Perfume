import 'server-only';

import { createClient } from '@/src/lib/supabase/server';
import type { CataloguePublication, ManagedCatalogue, ManagedProduct } from '@/src/lib/golden-rose/catalogue-management';

type CatalogueRead<T> = { data: T; unavailable?: never; error?: never } |
  { data?: never; unavailable?: boolean; error: string };

export function catalogueError(code?: string, message?: string) {
  if (code === 'PGRST202') return 'Full product editing is available after the catalogue migration is installed.';
  if (code && ['GR403', 'GR404', 'GR409', 'GR422'].includes(code)) return message ?? 'Product request declined.';
  return 'The catalogue service could not confirm this request. Retry or refresh the catalogue.';
}

async function readCatalogue<T>(action: 'list' | 'get', payload: Record<string, unknown>): Promise<CatalogueRead<T>> {
  const client = await createClient();
  const { data, error } = await client.rpc('gr_manage_catalogue', { p_action: action, p_payload: payload });
  if (!error && data && typeof data === 'object') return { data: data as T };
  return { error: catalogueError(error?.code, error?.message), unavailable: error?.code === 'PGRST202' };
}

export function readCataloguePage(search: string, publication: CataloguePublication, page: number) {
  return readCatalogue<ManagedCatalogue>('list', { search, publication, page });
}

export function readProductDetails(productId: string) {
  return readCatalogue<ManagedProduct>('get', { productId });
}
