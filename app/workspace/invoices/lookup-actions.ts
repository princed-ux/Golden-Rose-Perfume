'use server';

import {
  canViewModule,
} from '@/src/domain/permissions';

import {
  getStaffAccess,
} from '@/src/lib/golden-rose/staff';

import {
  createClient,
} from '@/src/lib/supabase/server';

import {
  formatPrice,
} from '@/src/lib/golden-rose/contracts';

import {
  loadMyPermissions,
} from '../permissions/actions';

import {
  loadCrmDirectory,
} from '../customers/data';

/* =========================================================
   GOLDEN ROSE — INVOICE LOOKUPS
   ========================================================= */

export type LookupPage<T> =
  | {
      items: T[];
      offset: number;
      limit: number;
      hasMore: boolean;
      error?: never;
    }
  | {
      error: string;
    };

export interface InvoiceCustomerChoice {
  id: string;
  label: string;
  detail: string;
  email: string | null;
  phone: string | null;
}

export interface InvoiceProductChoice {
  id: string;
  label: string;
  detail: string;
  sku: string | null;
  priceMinor: number;
}

interface InvoiceCatalogueItem {
  id: string;
  name: string;
  sku: string | null;
  sizeMl: number | null;
  priceMinor: number;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PAGE_SIZE = 20;

/* =========================================================
   INPUT VALIDATION
   ========================================================= */

function safeOffset(value: number): number {
  return (
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 1_000_000
  )
    ? value
    : 0;
}

function safeSearch(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().slice(0, 100)
    : '';
}

function record(
  value: unknown,
): Record<string, unknown> | null {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
    ? value as Record<string, unknown>
    : null;
}

function validProduct(
  value: unknown,
): value is InvoiceCatalogueItem {
  const item = record(value);

  if (!item) {
    return false;
  }

  return (
    typeof item.id === 'string' &&
    UUID.test(item.id) &&

    typeof item.name === 'string' &&
    item.name.trim().length > 0 &&

    (
      item.sku === null ||
      typeof item.sku === 'string'
    ) &&

    (
      item.sizeMl === null ||
      (
        typeof item.sizeMl === 'number' &&
        Number.isFinite(item.sizeMl) &&
        item.sizeMl >= 0
      )
    ) &&

    typeof item.priceMinor === 'number' &&
    Number.isSafeInteger(item.priceMinor) &&
    item.priceMinor > 0 &&
    item.priceMinor <= 100_000_000_000
  );
}

/* =========================================================
   EXISTING CUSTOMER DIRECTORY

   Invoice permission alone does not grant unrestricted
   access to the customer-management module.

   The billing service provides its own store-scoped
   customer lookup through findBillingCustomers().
   ========================================================= */

export async function findInvoiceCustomers(
  search: string,
  from: number,
): Promise<
  LookupPage<InvoiceCustomerChoice>
> {
  const staff = await getStaffAccess();

  if ('reason' in staff) {
    return {
      error:
        'An active employee session is required.',
    };
  }

  const permissions =
    await loadMyPermissions();

  if (
    !permissions.ok ||
    permissions.data.userId !== staff.userId ||
    permissions.data.role !== staff.role ||
    !permissions.data.invoiceAllowed ||
    !canViewModule(staff.role, 'customers')
  ) {
    return {
      error:
        'You do not have permission to browse the customer directory.',
    };
  }

  try {
    const directory =
      await loadCrmDirectory({
        search: safeSearch(search),
        offset: safeOffset(from),
        status: 'active',
        locationId: '',
      });

    return {
      items: directory.items.map(
        customer => ({
          id: customer.id,

          label:
            customer.fullName,

          detail:
            customer.locationName,

          email: customer.email,
          phone: customer.phone,
        }),
      ),

      offset: directory.offset,
      limit: directory.limit,
      hasMore: directory.hasMore,
    };

  } catch {
    return {
      error:
        'Could not load customers. Retry, or enter a billing recipient manually.',
    };
  }
}

/* =========================================================
   AUTHORIZED INVOICE CATALOGUE

   This catalogue contains only the product information
   required to prepare an invoice.

   It does not expose supplier costs, stock adjustments,
   product administration or unpublished storefront settings.
   ========================================================= */

export async function findInvoiceProducts(
  search: string,
  from: number,
): Promise<
  LookupPage<InvoiceProductChoice>
> {
  const staff = await getStaffAccess();

  if ('reason' in staff) {
    return {
      error:
        'An active employee session is required.',
    };
  }

  const permissions =
    await loadMyPermissions();

  if (
    !permissions.ok ||
    permissions.data.userId !== staff.userId ||
    permissions.data.role !== staff.role ||
    !permissions.data.invoiceAllowed
  ) {
    return {
      error:
        'You do not have permission to browse invoice products.',
    };
  }

  const offset = safeOffset(from);
  const term = safeSearch(search);

  try {
    const client = await createClient();

    /*
     * The database rechecks the current permission.
     *
     * Searches are applied to the full authorized catalogue
     * before pagination, rather than filtering only the
     * first page of products.
     */

    const { data, error } = await client.rpc(
      'gr_invoice_catalogue',
      {
        p_search: term,
        p_offset: offset,
      },
    );

    if (error) {
      if (error.code === '42501') {
        return {
          error:
            'Your invoice catalogue permission is no longer available.',
        };
      }

      console.error(
        '[Golden Rose invoice catalogue]',
        {
          code: error.code,
        },
      );

      return {
        error:
          'Could not load the invoice catalogue. Please retry.',
      };
    }

    const result = record(data);

    if (
      !result ||
      !Array.isArray(result.items) ||
      result.items.length > PAGE_SIZE ||
      !result.items.every(validProduct) ||
      typeof result.hasMore !== 'boolean'
    ) {
      return {
        error:
          'The invoice catalogue returned an invalid response.',
      };
    }

    const products = result.items;

    const ids = new Set(
      products.map(item => item.id),
    );

    if (ids.size !== products.length) {
      return {
        error:
          'Duplicate product variants were returned. Refresh and retry.',
      };
    }

    return {
      items: products.map(product => {
        const label =
          product.name +
          (
            product.sizeMl
              ? ` · ${product.sizeMl} ml`
              : ''
          );

        const detail = [
          product.sku,
          formatPrice(product.priceMinor),
        ]
          .filter(Boolean)
          .join(' · ');

        return {
          id: product.id,
          label,
          detail,
          sku: product.sku,
          priceMinor: product.priceMinor,
        };
      }),

      offset,

      limit: PAGE_SIZE,

      hasMore: result.hasMore,
    };

  } catch {
    console.error(
      '[Golden Rose invoice catalogue] Request failed.',
    );

    return {
      error:
        'Could not load the catalogue. Retry, or add a custom draft line.',
    };
  }
}