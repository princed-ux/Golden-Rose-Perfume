import { ActionForm, ActionButton } from '@/src/components/action-feedback';
import { Suspense } from 'react';

import { notFound } from 'next/navigation';
import { Receipt, WalletCards } from 'lucide-react';

import { canViewModule } from '@/src/domain/permissions';
import { formatPrice } from '@/src/lib/golden-rose/contracts';
import { requireStaff } from '@/src/lib/golden-rose/staff';
import { loadOperations } from '@/src/lib/golden-rose/operations';

import {
  WorkspacePageHeader,
} from '@/src/components/workspace/page-layout';

import {
  approveExpense,
  createExpense,
  recordExpensePayment,
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
  title: 'Expenses | Golden Rose Perfume',
};

export default function Page({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  return <Suspense fallback={<p role="status" className="p-6">Loading expenses…</p>}><OperationsContent searchParams={searchParams} /></Suspense>;
}

async function OperationsContent({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const { role } = await requireStaff();

  if (!canViewModule(role, 'expenses')) {
    notFound();
  }

  const data = await loadOperations().catch(() => null);
  const { result } = await searchParams;

  const canApprove =
    role === 'owner' || role === 'manager';

  const canRecordPayment =
    role === 'owner' || role === 'accountant';

  const committed =
    data?.expenses.filter(
      (expense) =>
        expense.status === 'approved' ||
        expense.status === 'recorded_paid',
    ) ?? [];

  const approvedTotal = committed.reduce(
    (sum, expense) => sum + expense.amountMinor,
    0,
  );

  const recordedPaidTotal = (
    data?.expenses ?? []
  )
    .filter(
      (expense) => expense.status === 'recorded_paid',
    )
    .reduce(
      (sum, expense) => sum + expense.amountMinor,
      0,
    );

  return (
    <div className="grid min-w-0 gap-6">
      <WorkspacePageHeader
        kicker="Finance / Business costs"
        title="Expenses"
        description="Record real operating costs, approval decisions and manually recorded payment references. These figures are not customer sales or verified bank settlements."
      />

      <ActionMessage result={result} />

      {!data ? (
        <WorkspaceNotice
          title="Expenses unavailable"
          tone="error"
        >
          Apply the procurement database migration and
          refresh.
        </WorkspaceNotice>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <WorkspacePanel>
              <p className="text-sm text-[#806d78]">
                Approved expense commitments
              </p>

              <strong className="mt-2 block font-serif text-3xl text-[#512238]">
                {formatPrice(approvedTotal)}
              </strong>
            </WorkspacePanel>

            <WorkspacePanel>
              <p className="text-sm text-[#806d78]">
                Payments manually recorded
              </p>

              <strong className="mt-2 block font-serif text-3xl text-[#512238]">
                {formatPrice(recordedPaidTotal)}
              </strong>
            </WorkspacePanel>
          </div>

          <WorkspacePanel className="grid gap-4">
            <h2 className="flex items-center gap-2 font-serif text-2xl text-[#54213a]">
              <Receipt size={20} />
              Record an expense
            </h2>

            <ActionForm
              action={createExpense}
              className="grid gap-3 md:grid-cols-2"
            >
              <Field label="Business location">
                <select
                  name="locationId"
                  className={workspaceInput}
                  defaultValue=""
                  required
                >
                  <option value="" disabled>
                    Choose location
                  </option>

                  {data.locations.map((location) => (
                    <option
                      key={location.id}
                      value={location.id}
                    >
                      {location.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Expense date">
                <input
                  type="date"
                  name="expenseDate"
                  required
                  className={workspaceInput}
                  defaultValue={new Date().toLocaleDateString(
                    'en-CA',
                    { timeZone: 'Africa/Lagos' },
                  )}
                />
              </Field>

              <Field label="Category">
                <select
                  name="category"
                  className={workspaceInput}
                  defaultValue="Rent"
                >
                  {[
                    'Rent',
                    'Utilities',
                    'Transport',
                    'Marketing',
                    'Salaries',
                    'Repairs',
                    'Packaging',
                    'Logistics',
                    'Bank fees',
                    'Other',
                  ].map((category) => (
                    <option key={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Amount (₦)">
                <input
                  type="number"
                  name="amount"
                  step="0.01"
                  min="0.01"
                  required
                  className={workspaceInput}
                />
              </Field>

              <div className="md:col-span-2">
                <Field label="Description / reason">
                  <textarea
                    name="description"
                    minLength={3}
                    maxLength={500}
                    rows={3}
                    required
                    className={workspaceInput}
                  />
                </Field>
              </div>

              <div className="md:col-span-2">
                <ActionButton
                  className={workspacePrimary}
                  type="submit"
                >
                  Record pending expense
                </ActionButton>
              </div>
            </ActionForm>
          </WorkspacePanel>

          <WorkspacePanel className="grid gap-4">
            <h2 className="flex items-center gap-2 font-serif text-2xl text-[#54213a]">
              <WalletCards size={20} />
              Expense ledger ({data.expenses.length})
            </h2>

            {!data.expenses.length && (
              <WorkspaceNotice title="No expenses recorded">
                Once entered, real expense records and
                their approval history will appear here.
              </WorkspaceNotice>
            )}

            {data.expenses.map((expense) => (
              <article
                key={expense.id}
                className="rounded-xl border border-[#eaddd5] bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-[#512238]">
                      {expense.category}
                      {' · '}
                      {formatPrice(expense.amountMinor)}
                    </h3>

                    <p className="mt-1 text-sm text-[#806d78]">
                      {expense.description}
                    </p>

                    <p className="mt-1 text-xs text-[#806d78]">
                      {expense.locationName}
                      {' · '}
                      {expense.expenseDate}
                      {' · '}
                      {expense.status.replaceAll('_', ' ')}
                    </p>

                    {expense.paymentReference && (
                      <p className="mt-1 text-xs text-[#806d78]">
                        Manual payment reference:{' '}
                        {expense.paymentReference}
                      </p>
                    )}
                  </div>

                  {canApprove &&
                    expense.status === 'pending' && (
                      <ActionForm action={approveExpense}>
                        <input
                          type="hidden"
                          name="id"
                          value={expense.id}
                        />

                        <ActionButton
                          type="submit"
                          className={workspacePrimary}
                        >
                          Approve
                        </ActionButton>
                      </ActionForm>
                    )}
                </div>

                {canRecordPayment &&
                  expense.status === 'approved' && (
                    <ActionForm
                      action={recordExpensePayment}
                      className="mt-3 flex flex-wrap items-end gap-2"
                    >
                      <input
                        type="hidden"
                        name="id"
                        value={expense.id}
                      />

                      <label className="grid gap-1 text-xs font-semibold text-[#6d4d5e]">
                        Actual payment/bank reference

                        <input
                          name="reference"
                          minLength={5}
                          maxLength={120}
                          required
                          className={workspaceInput}
                        />
                      </label>

                      <ActionButton
                        type="submit"
                        className={workspaceSecondary}
                      >
                        Record payment reference
                      </ActionButton>
                    </ActionForm>
                  )}
              </article>
            ))}
          </WorkspacePanel>
        </>
      )}
    </div>
  );
}
