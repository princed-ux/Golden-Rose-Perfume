
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { canViewModule } from '@/src/domain/permissions';
import { requireStaff } from '@/src/lib/golden-rose/staff';
import { billingFilters } from '@/src/lib/golden-rose/billing';

import { loadBilling } from './billing-actions';
import { InvoiceStudio } from './invoice-studio';
import './invoice-print.css';

export const metadata: Metadata = {
  title: 'Invoices & Quotes | Golden Rose Perfume',
  description:
    'Save quotations and invoices, issue official documents, and reconcile verified payments.',
};

export default async function InvoicesPage() {
  const { role } = await requireStaff();

  if (!canViewModule(role, 'invoices')) {
    notFound();
  }

  const initialBilling = await loadBilling(billingFilters);
  return <InvoiceStudio initialBilling={initialBilling} canBrowseCustomers={canViewModule(role, 'customers')}
    staffCatalogue={canViewModule(role, 'products')} />;
}
