
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { canViewModule } from '@/src/domain/permissions';
import { requireStaff } from '@/src/lib/golden-rose/staff';
import { billingFilters } from '@/src/lib/golden-rose/billing';

import { getBillingDocument, loadBilling } from './billing-actions';
import { InvoiceStudio } from './invoice-studio';
import './invoice-print.css';

export const metadata: Metadata = {
  title: 'Invoices & Quotes | Golden Rose Perfume',
  description:
    'Save quotations and invoices, issue official documents, and reconcile verified payments.',
};

type Params = Promise<Record<string,string|string[]|undefined>>;

export default function InvoicesPage({searchParams}: {searchParams:Params}) {
  return <Suspense fallback={<p role="status" className="p-5 text-sm text-[#6f5162]">Loading Invoice Studio…</p>}>
    <AuthorizedInvoiceStudio searchParams={searchParams} />
  </Suspense>;
}

async function AuthorizedInvoiceStudio({searchParams}: {searchParams:Params}) {
  const { role } = await requireStaff();

  if (!canViewModule(role, 'invoices')) {
    notFound();
  }

  const params = await searchParams;
  const id = typeof params.documentId === 'string' ? params.documentId : '';
  const [initialBilling, selected] = await Promise.all([loadBilling(billingFilters), id ? getBillingDocument(id) : Promise.resolve(null)]);
  if (selected?.error) return <p role="alert" className="p-5 text-[#7b243f]">{selected.error}</p>;
  return <InvoiceStudio initialBilling={initialBilling} initialDocument={selected?.data ?? null} canBrowseCustomers={canViewModule(role, 'customers')}
    staffCatalogue={canViewModule(role, 'products')} />;
}
