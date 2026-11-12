import 'server-only';

import { getSupabaseConfig } from '@/src/lib/supabase/config';
import type { AdminProduct, CatalogProduct, Location, StockBalance } from './contracts';

type EdgeFunction = 'staff-session' | 'inventory-admin' | 'inventory-receive' | 'catalog-public';

export class EdgeError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function callEdge<T>(
  name: EdgeFunction,
  { token, params, body }: { token?: string; params?: URLSearchParams; body?: object } = {},
): Promise<T> {
  try {
    const { url, publishableKey } = getSupabaseConfig();
    const endpoint = new URL('functions/v1/' + name, url.replace(/\/?$/, '/'));
    if (params) endpoint.search = params.toString();

    const headers: Record<string, string> = { apikey: publishableKey, Accept: 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body) headers['Content-Type'] = 'application/json';

    const response = await fetch(endpoint, {
      method: body ? 'POST' : 'GET',
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(12_000),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const message = typeof data?.error === 'string' && response.status < 500 ? data.error : null;
      const fallback = response.status === 401 ? 'Your session expired. Sign in and try again.'
        : response.status === 403 ? 'Your staff role does not permit this operation.'
          : 'Golden Rose could not complete the request. Try again.';
      throw new EdgeError(response.status, message ?? fallback);
    }

    if (data?.ok !== true) throw new EdgeError(502, 'Golden Rose returned an unexpected response. Try again.');
    return data as T;
  } catch (error) {
    if (error instanceof EdgeError) throw error;
    throw new EdgeError(503, 'Golden Rose could not reach the service. Try again.');
  }
}

const PAGE_SIZE = 100;

function pageParams(offset: number) {
  return new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
}

function itemsOf<T>(page: { items: T[] }) {
  if (!Array.isArray(page.items)) throw new EdgeError(502, 'Golden Rose returned an unexpected list.');
  return page.items;
}

async function* readPages<T>(loadPage: (offset: number) => Promise<{ items: T[] }>) {
  for (let offset = 0; offset <= 1_000_000; offset += PAGE_SIZE) {
    const items = itemsOf(await loadPage(offset));
    yield items;
    if (items.length < PAGE_SIZE) return;
  }
  throw new EdgeError(502, 'This list exceeds the catalogue service limit.');
}

function catalogPages() {
  return readPages(offset => callEdge<{ items: CatalogProduct[] }>('catalog-public', { params: pageParams(offset) }));
}

export async function listCatalog() {
  const products = new Map<string, CatalogProduct>();
  for await (const page of catalogPages()) {
    for (const product of page) products.set(product.id, product);
  }
  return [...products.values()];
}

export async function findCatalogProduct(idOrSlug: string) {
  for await (const page of catalogPages()) {
    const match = page.find(product => product.id === idOrSlug || product.slug === idOrSlug);
    if (match) return match;
  }
  return null;
}

export async function listAdminProducts(token: string) {
  const products = new Map<string, AdminProduct>();
  const pages = readPages(offset => callEdge<{ items: AdminProduct[] }>('inventory-admin', {
    token, params: pageParams(offset),
  }));
  for await (const page of pages) {
    for (const product of page) products.set(product.productId, product);
  }
  return [...products.values()];
}

export async function getInventoryPage(token: string, offset: number) {
  const params = pageParams(offset);
  params.set('view', 'inventory');
  const result = await callEdge<{ items: StockBalance[]; locations: Location[] }>('inventory-admin', { token, params });
  if (!Array.isArray(result.locations)) throw new EdgeError(502, 'Golden Rose returned an unexpected location list.');
  const items = itemsOf(result);
  return { items, locations: result.locations, pageSize: PAGE_SIZE, hasNext: items.length === PAGE_SIZE && offset < 1_000_000 };
}
