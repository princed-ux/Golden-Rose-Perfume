import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowRight, Building2, ContactRound, Mail, Phone, RefreshCw,
  Search, ShieldCheck, UsersRound,
} from 'lucide-react';

import { canViewModule } from '@/src/domain/permissions';
import { requireStaff } from '@/src/lib/golden-rose/staff';
import {
  WorkspaceNotice, WorkspacePageHeader, WorkspacePanel,
  workspaceInput, workspaceLabel, workspacePrimary, workspaceSecondary,
} from '@/src/components/workspace/page-layout';
import { CustomerHistory } from './customer-history';
import { CreateCustomer, EditCustomer } from './forms';
import { loadCrmDirectory, type CrmDirectory, type CrmFilters } from './data';

export const metadata: Metadata = {
  title: 'Customers CRM | Golden Rose Perfume',
  description: 'Private business customer profiles and store-scoped relationship management.',
};

type SearchParams = Record<string, string | string[] | undefined>;
const one = (params: SearchParams, key: string) =>
  typeof params[key] === 'string' ? params[key] as string : '';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { role } = await requireStaff();
  if (!canViewModule(role, 'customers')) notFound();

  const params = await searchParams;
  const search = one(params, 'search').trim().slice(0, 100);
  const status = one(params, 'status');
  const filters: CrmFilters = {
    search,
    status: status === 'archived' || status === 'all' ? status : 'active',
    locationId: one(params, 'locationId'),
    offset: /^\d{1,5}$/.test(one(params, 'offset')) &&
      Number(one(params, 'offset')) <= 10000
      ? Number(one(params, 'offset')) : 0,
  };

  let directory: CrmDirectory | null = null;
  let loadError = '';
  try {
    directory = await loadCrmDirectory(filters);
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Customer records could not be loaded.';
  }

  const customers = directory?.items ?? [];
  const locations = directory?.locations ?? [];
  const canArchive = role === 'owner' || role === 'manager';
  const pageUrl = (offset: number) => {
    const query = new URLSearchParams();
    if (filters.search) query.set('search', filters.search);
    if (filters.status !== 'active') query.set('status', filters.status);
    if (filters.locationId) query.set('locationId', filters.locationId);
    query.set('offset', String(offset));
    return '/workspace/customers?' + query.toString();
  };

  return <div className="grid min-w-0 gap-6 pb-10">
    <WorkspacePageHeader
      kicker="Golden Rose / Relationships"
      title="Customers CRM"
      description="Manage real customer profiles, contact information and service notes across authorized retail locations."
      actions={<Link href="/workspace/customers" className={workspaceSecondary}>
        <RefreshCw size={16} aria-hidden="true" /> Refresh
      </Link>}
    />

    <section className="grid gap-3 sm:grid-cols-3" aria-label="Customer directory snapshot">
      {[
        { label: 'Profiles shown', value: directory ? customers.length.toLocaleString('en-NG') : '—',
          detail: 'On the current page and filters', Icon: UsersRound },
        { label: 'Stores available', value: directory ? String(locations.length) : '—',
          detail: 'Only stores authorized for this role', Icon: Building2 },
        { label: 'Directory status', value: directory ? 'Connected' : 'Unavailable',
          detail: 'Live private Supabase CRM', Icon: ShieldCheck },
      ].map(({ label, value, detail, Icon }) =>
        <article key={label} className="min-w-0 rounded-2xl border border-gr-border bg-gr-surface p-5 shadow-[0_4px_24px_rgba(68,25,45,0.035)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-gr-muted">{label}</span>
            <span className="grid size-9 place-items-center rounded-xl bg-gr-surface-alt text-gr-gold">
              <Icon size={18} aria-hidden="true" />
            </span>
          </div>
          <p className="mt-3 font-serif text-2xl text-gr-text">{value}</p>
          <p className="mt-1 text-xs text-gr-muted">{detail}</p>
        </article>)}
    </section>

    {loadError && <WorkspaceNotice tone="error" title="Customer CRM connection unavailable"
      action={<Link className={workspaceSecondary} href="/workspace/customers">Retry</Link>}>
      {loadError} No records were changed.
    </WorkspaceNotice>}

    {directory && <CreateCustomer locations={locations} />}

    <WorkspacePanel label="gr-crm-filters" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="gr-crm-filters" className="font-serif text-2xl text-gr-text">
            Customer directory
          </h2>
          <p className="mt-1 text-xs text-gr-muted">
            Search name, telephone or email. Customer details are visible only to authorized staff.
          </p>
        </div>
        <ContactRound size={22} className="text-gr-gold" aria-hidden="true" />
      </div>

      <form method="get" action="/workspace/customers"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
        <label className={workspaceLabel}>Search customers
          <span className="relative">
            <Search size={17} aria-hidden="true"
              className="pointer-events-none absolute left-3 top-3.5 text-gr-gold" />
            <input name="search" type="search" maxLength={100}
              className={workspaceInput + ' pl-10'} defaultValue={filters.search}
              placeholder="Name, phone or email" />
          </span>
        </label>
        <label className={workspaceLabel}>Customer status
          <select name="status" className={workspaceInput} defaultValue={filters.status}>
            <option value="active">Active customers</option>
            <option value="archived">Archived</option>
            <option value="all">All customers</option>
          </select>
        </label>
        <label className={workspaceLabel}>Retail store
          <select name="locationId" className={workspaceInput}
            defaultValue={filters.locationId}>
            <option value="">All permitted stores</option>
            {locations.map(store => <option value={store.id} key={store.id}>
              {store.name}
            </option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button className={workspacePrimary} type="submit">
            <Search size={16} aria-hidden="true" /> Search
          </button>
          <Link href="/workspace/customers" className={workspaceSecondary}>Clear</Link>
        </div>
      </form>
    </WorkspacePanel>

    <WorkspacePanel label="gr-crm-records" className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="gr-crm-records" className="font-serif text-2xl text-gr-text">
            Customer profiles
          </h2>
          <p className="mt-1 text-xs text-gr-muted">
            {directory ? 'Live records · Most recently created first' : 'Waiting for the CRM connection'}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 text-xs text-gr-muted">
          <ShieldCheck size={16} aria-hidden="true" />
          Private business records
        </span>
      </div>

      {!directory ? <p className="rounded-xl bg-gr-surface p-6 text-sm text-gr-muted">
        The directory could not be loaded. Use Retry above to reconnect.
      </p> : customers.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-xl border border-dashed border-gr-border bg-gr-surface px-5 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-gr-surface-alt text-gr-gold">
            <UsersRound size={26} aria-hidden="true" />
          </span>
          <h3 className="font-serif text-xl text-gr-text">
            {filters.search || filters.status !== 'active' || filters.locationId
              ? 'No customers match these filters' : 'No customer profiles yet'}
          </h3>
          <p className="max-w-md text-sm leading-6 text-gr-muted">
            {filters.search || filters.status !== 'active' || filters.locationId
              ? 'Try another search or clear the filters.'
              : 'Use Add customer to record your first actual customer. No sample names are displayed.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {customers.map(customer =>
            <article key={customer.id}
              className="grid min-w-0 gap-4 rounded-xl border border-gr-border bg-gr-surface p-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(260px,1fr)] lg:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="break-words text-base text-gr-text">{customer.fullName}</strong>
                  <span className={'rounded-full px-2.5 py-1 text-[10px] font-semibold ' +
                    (customer.status === 'active'
                      ? 'bg-gr-success-bg text-gr-success'
                      : 'bg-gr-surface-alt text-gr-danger')}>
                    {customer.status === 'active' ? 'Active' : 'Archived'}
                  </span>
                </div>
                <p className="mt-2 text-xs text-gr-muted">{customer.locationName}</p>
                <p className="mt-1 text-xs text-gr-muted">
                  Added {new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeZone: 'Africa/Lagos' }).format(new Date(customer.createdAt))}
                </p>
              </div>
              <div className="grid min-w-0 gap-2 text-sm text-gr-muted">
                {customer.email && <p className="flex min-w-0 items-center gap-2">
                  <Mail size={16} className="shrink-0 text-gr-gold" aria-hidden="true" />
                  <span className="break-all">{customer.email}</span>
                </p>}
                {customer.phone && <p className="flex min-w-0 items-center gap-2">
                  <Phone size={16} className="shrink-0 text-gr-gold" aria-hidden="true" />
                  <span className="break-words">{customer.phone}</span>
                </p>}
                {customer.notes && <p className="line-clamp-3 whitespace-pre-wrap text-xs text-gr-muted">{customer.notes}</p>}
              </div>
              <EditCustomer customer={customer} locations={locations} canArchive={canArchive} />
              {canViewModule(role, 'invoices') && <CustomerHistory customerId={customer.id} storeId={customer.locationId} />}
            </article>)}
        </div>
      )}

      {directory && (directory.hasMore || filters.offset > 0) &&
        <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-gr-border pt-4"
          aria-label="Customer directory pages">
          <span className="text-xs text-gr-muted">
            Page {Math.floor(filters.offset / directory.limit) + 1} · {customers.length} profiles shown
          </span>
          <div className="flex gap-2">
            {filters.offset > 0 && <Link className={workspaceSecondary}
              href={pageUrl(Math.max(0, filters.offset - directory.limit))}>Previous</Link>}
            {directory.hasMore && <Link className={workspaceSecondary}
              href={pageUrl(filters.offset + directory.limit)}>
              Next <ArrowRight size={16} />
            </Link>}
          </div>
        </nav>}
    </WorkspacePanel>

    <p className="text-xs leading-6 text-gr-muted">
      Customer profiles are private CRM records, not automatically authenticated
      shopping accounts. Billing history links use customer IDs; names alone never link purchases.
    </p>
  </div>;
}
