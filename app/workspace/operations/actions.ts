'use server';

import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { actionOutcome, withActionFeedback } from '@/src/lib/action-result';

import { canViewModule } from '@/src/domain/permissions';
import type { WorkspaceModuleId } from '@/src/domain/modules';

import {
  nairaToKobo,
  UUID,
} from '@/src/lib/golden-rose/contracts';

import { requireStaff, StaffAccessUnavailableError } from '@/src/lib/golden-rose/staff';
import type { OperationResult } from '@/src/lib/golden-rose/contracts';
import { createClient } from '@/src/lib/supabase/server';

type OperationsAction =
  | 'supplier.save'
  | 'supplier.toggle'
  | 'purchase.create'
  | 'purchase.approve'
  | 'purchase.receive'
  | 'expense.create'
  | 'expense.approve'
  | 'expense.record_paid';

function read(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function fail(path: string, result: string): never {
  actionOutcome({status:'error',message: result === 'invalid' ? 'Review the supplied fields and quantities. Your entries have been kept.' : 'The operation could not be confirmed. Check the latest records before retrying.'});
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

/**
 * Execute an authorized Golden Rose operations command.
 *
 * The authenticated database function is responsible
 * for the final role, location and transaction checks.
 */
async function execute(
  module: WorkspaceModuleId,
  action: OperationsAction,
  payload: Record<string, unknown>,
  path: string,
  returnResult = true,
): Promise<OperationResult> {
  const feedback = (result: string): OperationResult => {
    if (!returnResult) fail(path, result);
    const messages: Record<string,string> = {
      duplicate: 'A supplier with these details already exists. Check the directory before retrying.',
      forbidden: 'Your active role or assigned store does not permit this change.',
      invalid: 'Review the supplied values; the record may no longer be editable.',
      unavailable: 'The save could not be confirmed. Check the directory before retrying. Your entered values have been kept.',
    };
    return {status:'error', message:messages[result] ?? messages.unavailable};
  };
  let staff;
  try { staff = await requireStaff(); }
  catch(error) {
    if (error instanceof StaffAccessUnavailableError) return feedback('unavailable');
    throw error;
  }
  if (!canViewModule(staff.role, module)) notFound();
  const client = await createClient();
  let data: {ok?: boolean} | null = null;
  let errorCode: string | undefined;
  try {
    const response = await client.rpc('gr_operations', {p_action:action, p_payload:payload});
    data = response.data;
    errorCode = response.error?.code;
  } catch { return feedback('unavailable'); }
  if (errorCode || data?.ok !== true) {
    console.error('[Golden Rose operations save]', {action, code:errorCode ?? 'invalid_response'});
    if (errorCode === '23505') return feedback('duplicate');
    if (['42501','GR403'].includes(errorCode ?? '')) return feedback('forbidden');
    if (['22023','22P02','22007','P0002'].includes(errorCode ?? '')) return feedback('invalid');
    return feedback('unavailable');
  }
  for (const entry of ['/workspace/suppliers','/workspace/purchases','/workspace/expenses','/workspace/inventory','/workspace/reports']) revalidatePath(entry);
  const messages: Record<OperationsAction,string> = {
    'supplier.save':'Supplier saved.', 'supplier.toggle':'Supplier status updated.',
    'purchase.create':'Purchase order created.', 'purchase.approve':'Purchase order approved.',
    'purchase.receive':'Stock receipt confirmed.', 'expense.create':'Expense recorded for approval.',
    'expense.approve':'Expense approved.', 'expense.record_paid':'Payment reference recorded; this does not independently verify a bank transfer.',
  };
  return {status:'success',message:messages[action]};
}

async function submitSupplier(form: FormData, returnResult = true): Promise<OperationResult> {
  const path = '/workspace/suppliers';
  const id=read(form,'id'), name=read(form,'name'), email=read(form,'email'), phone=read(form,'phone');
  const contactName=read(form,'contactName'), address=read(form,'address'), termsDays=read(form,'termsDays') || '0';
  if ((id && !UUID.test(id)) || name.length<2 || name.length>150 || contactName.length>120 || phone.length>40 || address.length>300 ||
      (email.length>0 && (email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) || !/^\d{1,3}$/.test(termsDays) || Number(termsDays)>365) {
    if (returnResult) return {status:'error', message:'Check the supplier name, email, phone and payment terms. Your entered values have been kept.'};
    fail(path,'invalid');
  }
  return execute('suppliers','supplier.save',{id:id||null,name,email,phone,contactName,address,termsDays},path,returnResult);
}

async function dosaveSupplier(form: FormData): Promise<OperationResult> { return submitSupplier(form); }
export async function saveSupplierState(form: FormData): Promise<OperationResult> { return withActionFeedback(() => submitSupplier(form,true)); }

/**
 * Activate or deactivate a supplier.
 */
async function dotoggleSupplier(
  form: FormData,
): Promise<OperationResult> {
  const path = '/workspace/suppliers';

  const id = read(form, 'id');
  const active = read(form, 'active');

  if (
    !UUID.test(id) ||
    !['true', 'false'].includes(active)
  ) {
    fail(path, 'invalid');
  }

  return execute(
    'suppliers',
    'supplier.toggle',
    {
      id,
      active: active === 'true',
    },
    path,
  );
}

/**
 * Create a purchase order with one or more
 * existing catalogue SKUs.
 */
async function docreatePurchase(
  form: FormData,
): Promise<OperationResult> {
  const path = '/workspace/purchases';

  const supplierId = read(form, 'supplierId');
  const locationId = read(form, 'locationId');
  const expectedDate = read(form, 'expectedDate');
  const note = read(form, 'note');

  if (
    !UUID.test(supplierId) ||
    !UUID.test(locationId) ||
    (
      expectedDate.length > 0 &&
      !validDate(expectedDate)
    ) ||
    note.length > 500
  ) {
    fail(path, 'invalid');
  }

  const rows = read(form, 'lines')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (rows.length < 1 || rows.length > 40) {
    fail(path, 'invalid');
  }

  const seen = new Set<string>();

  const lines: Array<{
    sku: string;
    quantity: number;
    unitCostMinor: number;
  }> = [];

  for (const row of rows) {
    const parts = row.split('|').map((part) => part.trim());

    if (parts.length !== 3) {
      fail(path, 'invalid');
    }

    const [sku, rawQuantity, rawCost] = parts;
    const unitCostMinor = nairaToKobo(rawCost ?? '');

    if (
      !sku ||
      sku.length > 100 ||
      !/^[1-9]\d{0,5}$/.test(rawQuantity ?? '') ||
      Number(rawQuantity) > 100000 ||
      unitCostMinor === null ||
      unitCostMinor <= 0 ||
      seen.has(sku.toLowerCase())
    ) {
      fail(path, 'invalid');
    }

    seen.add(sku.toLowerCase());

    lines.push({
      sku,
      quantity: Number(rawQuantity),
      unitCostMinor,
    });
  }

  return execute(
    'purchases',
    'purchase.create',
    {
      supplierId,
      locationId,
      expectedDate: expectedDate || null,
      note,
      lines,
    },
    path,
  );
}

/**
 * Approve a draft purchase order.
 */
async function doapprovePurchase(
  form: FormData,
): Promise<OperationResult> {
  const path = '/workspace/purchases';
  const id = read(form, 'id');

  if (!UUID.test(id)) {
    fail(path, 'invalid');
  }

  return execute(
    'purchases',
    'purchase.approve',
    { id },
    path,
  );
}

/**
 * Receive a quantity against an approved
 * purchase order line.
 *
 * The request key prevents duplicate receipts
 * when a transaction is retried.
 */
async function doreceivePurchaseLine(
  form: FormData,
): Promise<OperationResult> {
  const path = '/workspace/purchases';

  const lineId = read(form, 'lineId');
  const requestKey = read(form, 'requestKey');
  const quantity = read(form, 'quantity');

  if (
    !UUID.test(lineId) ||
    !UUID.test(requestKey) ||
    !/^[1-9]\d{0,5}$/.test(quantity) ||
    Number(quantity) > 100000
  ) {
    fail(path, 'invalid');
  }

  return execute(
    'purchases',
    'purchase.receive',
    {
      lineId,
      requestKey,
      quantity: Number(quantity),
    },
    path,
  );
}

/**
 * Create an expense awaiting approval.
 */
async function docreateExpense(
  form: FormData,
): Promise<OperationResult> {
  const path = '/workspace/expenses';

  const locationId = read(form, 'locationId');
  const category = read(form, 'category');
  const description = read(form, 'description');
  const expenseDate = read(form, 'expenseDate');
  const amountMinor = nairaToKobo(
    read(form, 'amount'),
  );

  if (
    !UUID.test(locationId) ||
    category.length < 2 ||
    category.length > 60 ||
    description.length < 3 ||
    description.length > 500 ||
    !validDate(expenseDate) ||
    amountMinor === null ||
    amountMinor <= 0
  ) {
    fail(path, 'invalid');
  }

  return execute(
    'expenses',
    'expense.create',
    {
      locationId,
      category,
      description,
      expenseDate,
      amountMinor,
    },
    path,
  );
}

/**
 * Approve a pending expense.
 */
async function doapproveExpense(
  form: FormData,
): Promise<OperationResult> {
  const path = '/workspace/expenses';
  const id = read(form, 'id');

  if (!UUID.test(id)) {
    fail(path, 'invalid');
  }

  return execute(
    'expenses',
    'expense.approve',
    { id },
    path,
  );
}

/**
 * Record a payment reference for
 * an approved expense.
 *
 * This records staff-provided evidence.
 * It does not independently verify a bank transfer.
 */
async function dorecordExpensePayment(
  form: FormData,
): Promise<OperationResult> {
  const path = '/workspace/expenses';

  const id = read(form, 'id');
  const reference = read(form, 'reference');

  if (
    !UUID.test(id) ||
    reference.length < 5 ||
    reference.length > 120
  ) {
    fail(path, 'invalid');
  }

  return execute(
    'expenses',
    'expense.record_paid',
    {
      id,
      reference,
    },
    path,
  );
}

export async function saveSupplier(form: FormData): Promise<OperationResult> { return withActionFeedback(() => dosaveSupplier(form)); }

export async function toggleSupplier(form: FormData): Promise<OperationResult> { return withActionFeedback(() => dotoggleSupplier(form)); }

export async function createPurchase(form: FormData): Promise<OperationResult> { return withActionFeedback(() => docreatePurchase(form)); }

export async function approvePurchase(form: FormData): Promise<OperationResult> { return withActionFeedback(() => doapprovePurchase(form)); }

export async function receivePurchaseLine(form: FormData): Promise<OperationResult> { return withActionFeedback(() => doreceivePurchaseLine(form)); }

export async function createExpense(form: FormData): Promise<OperationResult> { return withActionFeedback(() => docreateExpense(form)); }

export async function approveExpense(form: FormData): Promise<OperationResult> { return withActionFeedback(() => doapproveExpense(form)); }

export async function recordExpensePayment(form: FormData): Promise<OperationResult> { return withActionFeedback(() => dorecordExpensePayment(form)); }
