import { ActionForm, ActionButton } from '@/src/components/action-feedback';
import { SupplierForm } from './supplier-form';
import { Suspense } from 'react';

import { notFound } from 'next/navigation';
import { Building2, Plus, Truck } from 'lucide-react';

import { canViewModule } from '@/src/domain/permissions';
import { requireStaff } from '@/src/lib/golden-rose/staff';
import { loadOperations } from '@/src/lib/golden-rose/operations';

import {
  WorkspacePageHeader,
} from '@/src/components/workspace/page-layout';

import {
  toggleSupplier,
} from '../operations/actions';

import {
  ActionMessage,
  Field,
  WorkspaceNotice,
  WorkspacePanel,
  workspaceInput,
  workspacePrimary,
  workspaceSecondary,
} from '../operations/ui';

export const metadata = {
  title: 'Suppliers | Golden Rose Perfume',
};

export default function Page({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  return <Suspense fallback={<p role="status" className="p-6">Loading suppliers…</p>}><OperationsContent searchParams={searchParams} /></Suspense>;
}

async function OperationsContent({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const { role } = await requireStaff();

  if (!canViewModule(role, 'suppliers')) {
    notFound();
  }

  const data = await loadOperations().catch(() => null);
  const { result } = await searchParams;

  const canEdit =
    role === 'owner' || role === 'manager';

  return (
    <div className="grid min-w-0 gap-6">
      <WorkspacePageHeader
        kicker="Procurement / Partners"
        title="Suppliers"
        description="Real supplier contacts, purchasing terms and active status. No sample supplier records."
      />

      <ActionMessage result={result} />

      {!data ? (
        <WorkspaceNotice
          title="Suppliers are unavailable"
          tone="error"
        >
          The operations service could not be reached. Retry the page; your staff session has not been cleared.
        </WorkspaceNotice>
      ) : (
        <>
          {canEdit && (
            <WorkspacePanel className="grid gap-4">
              <h2 className="flex items-center gap-2 font-serif text-2xl text-[#54213a]">
                <Plus size={19} />
                Register supplier
              </h2>

              <SupplierForm
                className="grid gap-3 md:grid-cols-2"
              >
                <Field label="Supplier or business name">
                  <input
                    name="name"
                    className={workspaceInput}
                    required
                    minLength={2}
                    maxLength={150}
                  />
                </Field>

                <Field label="Contact person">
                  <input
                    name="contactName"
                    className={workspaceInput}
                    maxLength={120}
                  />
                </Field>

                <Field label="Email">
                  <input
                    name="email"
                    type="email"
                    className={workspaceInput}
                    maxLength={254}
                  />
                </Field>

                <Field label="Phone">
                  <input
                    name="phone"
                    type="tel"
                    className={workspaceInput}
                    maxLength={40}
                  />
                </Field>

                <Field label="Payment terms (days)">
                  <input
                    name="termsDays"
                    type="number"
                    className={workspaceInput}
                    defaultValue={0}
                    min={0}
                    max={365}
                    required
                  />
                </Field>

                <Field label="Address">
                  <input
                    name="address"
                    className={workspaceInput}
                    maxLength={300}
                  />
                </Field>

                <div className="md:col-span-2">
                  <ActionButton
                    className={workspacePrimary}
                    type="submit"
                  >
                    Save supplier
                  </ActionButton>
                </div>
              </SupplierForm>
            </WorkspacePanel>
          )}

          <WorkspacePanel className="grid gap-4">
            <h2 className="flex items-center gap-2 font-serif text-2xl text-[#54213a]">
              <Truck size={20} />
              Supplier directory ({data.suppliers.length})
            </h2>

            {data.suppliers.length === 0 && (
              <WorkspaceNotice title="No suppliers yet">
                Register the real supplier before creating
                a purchase order.
              </WorkspaceNotice>
            )}

            {data.suppliers.map((supplier) => (
              <article
                key={supplier.id}
                className="rounded-xl border border-[#eaddd5] bg-white p-4"
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <Building2
                      size={18}
                      className="mt-1 text-[#9b713e]"
                    />

                    <div>
                      <h3 className="font-semibold text-[#512238]">
                        {supplier.name}
                      </h3>

                      <p className="text-sm text-[#806d78]">
                        {supplier.contactName ||
                          'No contact person'}
                        {' · '}
                        {supplier.phone || 'No phone'}
                      </p>

                      {supplier.email && (
                        <p className="text-sm text-[#806d78]">
                          {supplier.email}
                        </p>
                      )}

                      <p className="text-xs text-[#806d78]">
                        {supplier.termsDays} day payment terms
                        {' · '}
                        {supplier.active ? 'Active' : 'Inactive'}
                      </p>
                    </div>
                  </div>

                  {canEdit && (
                    <ActionForm action={toggleSupplier}>
                      <input
                        type="hidden"
                        name="id"
                        value={supplier.id}
                      />

                      <input
                        type="hidden"
                        name="active"
                        value={String(!supplier.active)}
                      />

                      <ActionButton
                        type="submit"
                        className={workspaceSecondary}
                      >
                        {supplier.active
                          ? 'Deactivate'
                          : 'Reactivate'}
                      </ActionButton>
                    </ActionForm>
                  )}
                </div>

                {canEdit && (
                  <details className="mt-3 border-t border-[#efe4dc] pt-3">
                    <summary className="cursor-pointer text-sm font-semibold text-[#6a3e54]">
                      Edit supplier
                    </summary>

                    <SupplierForm
                      className="mt-4 grid gap-3 md:grid-cols-2"
                    >
                      <input
                        type="hidden"
                        name="id"
                        value={supplier.id}
                      />

                      <Field label="Supplier name">
                        <input
                          name="name"
                          className={workspaceInput}
                          defaultValue={supplier.name}
                          minLength={2}
                          maxLength={150}
                          required
                        />
                      </Field>

                      <Field label="Contact person">
                        <input
                          name="contactName"
                          className={workspaceInput}
                          defaultValue={supplier.contactName}
                          maxLength={120}
                        />
                      </Field>

                      <Field label="Email">
                        <input
                          name="email"
                          type="email"
                          className={workspaceInput}
                          defaultValue={supplier.email}
                          maxLength={254}
                        />
                      </Field>

                      <Field label="Phone">
                        <input
                          name="phone"
                          type="tel"
                          className={workspaceInput}
                          defaultValue={supplier.phone}
                          maxLength={40}
                        />
                      </Field>

                      <Field label="Payment terms (days)">
                        <input
                          name="termsDays"
                          type="number"
                          className={workspaceInput}
                          defaultValue={supplier.termsDays}
                          min={0}
                          max={365}
                        />
                      </Field>

                      <Field label="Address">
                        <input
                          name="address"
                          className={workspaceInput}
                          defaultValue={supplier.address}
                          maxLength={300}
                        />
                      </Field>

                      <div className="md:col-span-2">
                        <ActionButton
                          type="submit"
                          className={workspacePrimary}
                        >
                          Update supplier
                        </ActionButton>
                      </div>
                    </SupplierForm>
                  </details>
                )}
              </article>
            ))}
          </WorkspacePanel>
        </>
      )}
    </div>
  );
}
