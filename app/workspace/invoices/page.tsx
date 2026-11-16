
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { canViewModule } from '@/src/domain/permissions';
import { requireStaff } from '@/src/lib/golden-rose/staff';

import { InvoiceStudio } from './invoice-studio';
import './invoice-print.css';

export const metadata: Metadata = {
  title: 'Invoices & Quotes | Golden Rose Perfume',
  description:
    'Professional quotations, invoice drafts, document previews and print layouts.',
};

export default async function InvoicesPage() {
  const { role } = await requireStaff();

  if (!canViewModule(role, 'invoices')) {
    notFound();
  }

  return <InvoiceStudio canBrowseCustomers={canViewModule(role, 'customers')} staffCatalogue={canViewModule(role, 'products')} />;
}
