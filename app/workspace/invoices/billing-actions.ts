'use server';

import { revalidatePath } from 'next/cache';

import {
  getStaffAccess,
} from '@/src/lib/golden-rose/staff';

import {
  createClient,
} from '@/src/lib/supabase/server';

import type {
  BillingAction,
  BillingDocument,
  BillingFilters,
  BillingPayload,
  BillingRegisterData,
  BillingResult,
} from '@/src/lib/golden-rose/billing';

import {
  loadMyPermissions,
} from '../permissions/actions';

import type {
  InvoiceCustomerChoice,
  LookupPage,
} from './lookup-actions';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Command =
  | BillingAction
  | 'list'
  | 'get'
  | 'customers';

const writes: readonly BillingAction[] = [
  'configure',
  'save',
  'accept',
  'convert',
  'issue',
  'void',
  'apply_pos',
  'propose_payment',
  'review_payment',
];

/* =========================================================
   VERIFIED BILLING OPERATIONS
   ========================================================= */

async function execute<T>(
  action: Command,
  payload: BillingPayload,
): Promise<BillingResult<T>> {
  try {
    const staff = await getStaffAccess();

    if ('reason' in staff) {
      if (staff.reason === 'unavailable') {
        return {
          error:
            'Staff verification is temporarily unavailable. Retry without signing out.',
        };
      }

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
          'You do not currently have permission to access invoices and quotations.',
      };
    }

    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    ) {
      return {
        error: 'Invalid billing request.',
      };
    }

    const client = await createClient();

    /*
     * The database independently checks:
     *
     * - Active employee session
     * - Individual invoice permission
     * - Assigned selling location
     * - Document state
     * - Owner-only configuration
     * - Authorized payment verification
     * - Transaction consistency
     */

    const { data, error } = await client.rpc(
      'gr_billing',
      {
        p_action: action,
        p_payload: payload,
      },
    );

    if (
      !error &&
      data !== null &&
      typeof data === 'object' &&
      (
        Array.isArray(data)
          ? action === 'customers'
          : action !== 'customers'
      )
    ) {
      return {
        data: data as T,
      };
    }

    if (
      error?.code === 'PGRST202' ||
      error?.code === '42883'
    ) {
      return {
        error:
          'The billing service is unavailable. Only local draft previews are available.',

        unavailable: true,
      };
    }

    if (error?.code === '42501') {
      return {
        error:
          'Your permission or assigned selling location does not authorize this operation.',
      };
    }

    if (
      error &&
      [
        'GR403',
        'GR404',
        'GR409',
        'GR422',
      ].includes(error.code)
    ) {
      return {
        error: error.message,
      };
    }

    console.error(
      '[Golden Rose billing] Operation failed',
      {
        action,
        code:
          error?.code ??
          'unexpected_response',
      },
    );

  } catch {
    console.error(
      '[Golden Rose billing] Service unavailable',
      { action },
    );
  }

  return {
    error:
      'Could not reach billing. Retry before assuming the operation completed.',
  };
}

/* =========================================================
   INVOICE AND QUOTATION REGISTER
   ========================================================= */

export async function loadBilling(
  filters: BillingFilters,
): Promise<BillingResult<BillingRegisterData>> {
  const result =
    await execute<BillingRegisterData>(
      'list',
      { ...filters },
    );

  if (
    result.data &&
    (
      !Array.isArray(
        result.data.documents,
      ) ||
      !Array.isArray(
        result.data.stores,
      ) ||
      typeof result.data.more !== 'boolean'
    )
  ) {
    return {
      error:
        'Billing returned an unexpected register. Retry before making changes.',
    };
  }

  return result;
}

/* =========================================================
   INDIVIDUAL BILLING DOCUMENT
   ========================================================= */

export async function getBillingDocument(
  id: string,
): Promise<BillingResult<BillingDocument>> {
  if (
    typeof id !== 'string' ||
    !UUID.test(id)
  ) {
    return {
      error:
        'Select a valid billing document.',
    };
  }

  const result =
    await execute<BillingDocument>(
      'get',
      { id },
    );

  if (
    result.data &&
    (
      result.data.id !== id ||
      !Array.isArray(result.data.lines) ||
      !Array.isArray(result.data.payments)
    )
  ) {
    return {
      error:
        'Billing returned an unverifiable document. Refresh and retry.',
    };
  }

  return result;
}

/* =========================================================
   DOCUMENT WRITES
   ========================================================= */

export async function updateBilling(
  action: BillingAction,
  payload: BillingPayload,
): Promise<
  BillingResult<
    BillingDocument |
    { configured: true }
  >
> {
  if (!writes.includes(action)) {
    return {
      error: 'Unknown billing operation.',
    };
  }

  const result = await execute<
    BillingDocument |
    { configured: true }
  >(
    action,
    payload,
  );

  if (result.data) {
    /*
     * A successful database operation must not
     * become an apparent failure solely because
     * cache invalidation fails.
     */

    try {
      revalidatePath('/workspace/invoices');
      revalidatePath('/workspace/customers');
      revalidatePath('/workspace/orders');

    } catch {
      console.error(
        '[Golden Rose billing] Workspace refresh failed.',
      );
    }
  }

  return result;
}

/* =========================================================
   STORE-SCOPED BILLING CUSTOMERS
   ========================================================= */

export async function findBillingCustomers(
  storeId: string,
  query: string,
): Promise<
  LookupPage<InvoiceCustomerChoice>
> {
  if (
    typeof storeId !== 'string' ||
    !UUID.test(storeId)
  ) {
    return {
      error: 'Select a valid selling location.',
    };
  }

  const search =
    typeof query === 'string'
      ? query.trim().slice(0, 100)
      : '';

  const response = await execute<{
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
  }[]>(
    'customers',
    {
      storeId,
      search,
    },
  );

  if (!response.data) {
    return {
      error: response.error,
    };
  }

  return {
    items: response.data.map(item => ({
      id: item.id,

      label: item.full_name,

      detail:
        item.email ??
        item.phone ??
        'Customer at selected store',

      email: item.email,
      phone: item.phone,
    })),

    offset: 0,
    limit: 15,
    hasMore: false,
  };
}