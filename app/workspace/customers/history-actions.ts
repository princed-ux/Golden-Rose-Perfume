'use server';

import { billingFilters, type BillingDocument, type BillingResult } from '@/src/lib/golden-rose/billing';
import { customerActivity } from '@/src/lib/golden-rose/customer-activity';
import { getBillingDocument, loadBilling } from '../invoices/billing-actions';

type Activity = ReturnType<typeof customerActivity> & {page:number;more:boolean};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Bounded compatibility reader: the deployed register has no customer-ID filter. */
export async function loadCustomerActivity(customerId:string, storeId:string, page=0):Promise<BillingResult<Activity>> {
  if (!uuid.test(customerId) || !uuid.test(storeId) || !Number.isInteger(page) || page < 0 || page > 10000)
    return {error:'Select a valid customer and store.'};
  const register = await loadBilling({...billingFilters,storeId,page});
  if (!register.data) return {error:register.error};
  const documents:BillingDocument[] = [];
  // At most 25 documents, five concurrent requests. Never scan the whole business in memory.
  for (let offset=0;offset<register.data.documents.length;offset+=5) {
    const results = await Promise.all(register.data.documents.slice(offset,offset+5).map(row=>getBillingDocument(row.id)));
    for (const result of results) {
      if (!result.data) return {error:result.error};
      documents.push(result.data);
    }
  }
  return {data:{...customerActivity(documents,customerId,storeId),page,more:register.data.more}};
}
