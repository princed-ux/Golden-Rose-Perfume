import 'server-only';

import { createClient } from '@/src/lib/supabase/server';

export interface CrmCustomer {
  id: string;
  locationId: string;
  locationName: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  notes: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface CrmLocation {
  id: string;
  name: string;
  code: string;
}

export interface CrmDirectory {
  items: CrmCustomer[];
  locations: CrmLocation[];
  hasMore: boolean;
  offset: number;
  limit: number;
}

export interface CrmFilters {
  search: string;
  status: 'active' | 'archived' | 'all';
  locationId: string;
  offset: number;
}

export function crmMessage(
  error: { code?: string; message?: string } | null,
): string {
  if (!error) return 'Customer operation could not be completed.';
  if (error.code === 'GR403' || error.code === '42501') {
    return 'Your active staff role or store assignment does not permit this operation.';
  }
  if (error.code === 'GR409') {
    return 'This customer changed since you opened the form. Refresh before editing.';
  }
  if (error.code === '23505') {
    return 'That work email already belongs to an active customer at this store.';
  }
  if (error.code === 'P0002') return 'Customer not found or outside your assigned store.';
  if (error.code === 'PGRST202') return 'The customer CRM database migration is not available yet.';
  if (error.code === '22023' || error.code === '22P02' || error.code === '22007') {
    return error.message?.slice(0, 200) ?? 'Invalid customer details.';
  }
  return 'Customer service unavailable. Refresh and retry.';
}

export async function loadCrmDirectory(filters: CrmFilters): Promise<CrmDirectory> {
  const client = await createClient();
  const { data, error } = await client.rpc('gr_crm_manage', {
    p_action: 'list',
    p_payload: {
      search: filters.search,
      status: filters.status,
      locationId: filters.locationId,
      offset: filters.offset,
      limit: 25,
    },
  });

  if (error) throw new Error(crmMessage(error));
  if (!data || typeof data !== 'object' || !Array.isArray(data.items) ||
      !Array.isArray(data.locations) || typeof data.hasMore !== 'boolean') {
    throw new Error('The customer directory returned an unexpected response.');
  }

  return {
    items: data.items as CrmCustomer[],
    locations: data.locations as CrmLocation[],
    hasMore: data.hasMore,
    offset: filters.offset,
    limit: 25,
  };
}
