
import 'server-only';

import { createClient } from '@/src/lib/supabase/server';

export interface Supplier {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  termsDays: number;
  active: boolean;
}

export interface BusinessLocation {
  id: string;
  name: string;
  type: string;
}

export interface PurchaseLine {
  id: string;
  sku: string;
  productName: string;
  quantity: number;
  receivedQuantity: number;
  unitCostMinor: number;
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  locationId: string;
  locationName: string;
  status:
    | 'draft'
    | 'approved'
    | 'partially_received'
    | 'received'
    | 'cancelled';
  totalMinor: number;
  note: string;
  expectedDate: string | null;
  createdAt: string;
  lines: PurchaseLine[];
}

export interface Expense {
  id: string;
  locationId: string;
  locationName: string;
  category: string;
  description: string;
  expenseDate: string;
  amountMinor: number;
  status:
    | 'pending'
    | 'approved'
    | 'recorded_paid'
    | 'voided';
  paymentReference: string | null;
  createdAt: string;
}

export interface Operations {
  suppliers: Supplier[];
  purchases: PurchaseOrder[];
  expenses: Expense[];
  locations: BusinessLocation[];
}

/**
 * Loads the authenticated staff member's operational data.
 *
 * Authorization and branch-level restrictions are
 * enforced by public.gr_operations in Supabase.
 */
export async function loadOperations(): Promise<Operations> {
  const client = await createClient();

  const { data, error } = await client.rpc(
    'gr_operations',
    {
      p_action: 'list',
      p_payload: {},
    },
  );

  if (error) {
    console.error('[Golden Rose operations]', {
      code: error.code,
      message: error.message,
    });

    throw new Error(
      'Unable to load business operations. Check the database connection and staff permissions.',
    );
  }

  if (
    !data ||
    typeof data !== 'object' ||
    !Array.isArray(data.suppliers) ||
    !Array.isArray(data.purchases) ||
    !Array.isArray(data.expenses) ||
    !Array.isArray(data.locations)
  ) {
    throw new Error(
      'The operations service returned an invalid response.',
    );
  }

  return data as Operations;
}
