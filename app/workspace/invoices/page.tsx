import type { Metadata } from 'next';

import {
  notFound,
  redirect,
} from 'next/navigation';

import { Suspense } from 'react';

import {
  canViewModule,
} from '@/src/domain/permissions';

import {
  requireStaff,
} from '@/src/lib/golden-rose/staff';

import {
  billingFilters,
} from '@/src/lib/golden-rose/billing';

import {
  WorkspaceNotice,
} from '@/src/components/workspace/page-layout';

import {
  loadMyPermissions,
} from '../permissions/actions';

import {
  getBillingDocument,
  loadBilling,
} from './billing-actions';

import { InvoiceStudio } from './invoice-studio';

import './invoice-print.css';

export const metadata: Metadata = {
  title: 'Invoices & Quotes | Golden Rose Perfume',

  description:
    'Save quotations and invoices, issue official documents, and reconcile verified payments.',
};

type Params = Promise<
  Record<string, string | string[] | undefined>
>;

export default function InvoicesPage({
  searchParams,
}: {
  searchParams: Params;
}) {
  return (
    <Suspense
      fallback={
        <p
          role="status"
          className="p-5 text-sm text-[#6f5162]"
        >
          Loading Invoice Studio…
        </p>
      }
    >
      <AuthorizedInvoiceStudio
        searchParams={searchParams}
      />
    </Suspense>
  );
}

/* =========================================================
   AUTHENTICATED INVOICE ACCESS
   ========================================================= */

async function AuthorizedInvoiceStudio({
  searchParams,
}: {
  searchParams: Params;
}) {
  const staff = await requireStaff();

  const permissions = await loadMyPermissions();

  if (!permissions.ok) {
    return (
      <WorkspaceNotice
        tone="error"
        title="Invoice access unavailable"
      >
        {permissions.message}
      </WorkspaceNotice>
    );
  }

  if (
    permissions.data.userId !== staff.userId ||
    permissions.data.role !== staff.role
  ) {
    notFound();
  }

  /*
   * The verified individual permission replaces
   * the original role-only invoice restriction.
   */

  if (!permissions.data.invoiceAllowed) {
    /*
     * Accountants normally land on the invoice page.
     * If the owner revokes that access, redirect to
     * their existing expenses workspace.
     */

    if (staff.role === 'accountant') {
      redirect('/workspace/expenses');
    }

    notFound();
  }

  const params = await searchParams;

  const id =
    typeof params.documentId === 'string'
      ? params.documentId
      : '';

  const [initialBilling, selected] = await Promise.all([
    loadBilling(billingFilters),

    id
      ? getBillingDocument(id)
      : Promise.resolve(null),
  ]);

  if (selected?.error) {
    return (
      <WorkspaceNotice
        tone="error"
        title="Unable to open invoice"
      >
        {selected.error}
      </WorkspaceNotice>
    );
  }

  /*
   * Invoice catalogue access is now separately
   * authorized by the invoice permission.
   *
   * Broader CRM access still follows the existing
   * customer-management authorization.
   */

  return (
    <InvoiceStudio
      initialBilling={initialBilling}
      initialDocument={selected?.data ?? null}
      canBrowseCustomers={
        canViewModule(staff.role, 'customers')
      }
      staffCatalogue={true}
    />
  );
}