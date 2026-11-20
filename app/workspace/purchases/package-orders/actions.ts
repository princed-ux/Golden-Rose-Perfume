
'use server';

import { revalidatePath } from 'next/cache';

import { getStaffAccess } from '@/src/lib/golden-rose/staff';
import {
  nairaToKobo,
  UUID,
} from '@/src/lib/golden-rose/contracts';
import { createClient } from '@/src/lib/supabase/server';

export type PurchaseFeedback = {
  status: 'idle' | 'success' | 'error';
  message: string;
  id?: string;
};

type Command = 'create' | 'receive' | 'approve';

function read(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function failure(message: string): PurchaseFeedback {
  return { status: 'error', message };
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

async function execute(
  command: Command,
  payload: Record<string, unknown>,
): Promise<PurchaseFeedback> {
  const access = await getStaffAccess();

  if ('reason' in access) {
    return failure(
      access.reason === 'unavailable'
        ? 'Staff verification is temporarily unavailable. Please retry.'
        : 'Your staff session is no longer authorized. Sign in again.',
    );
  }

  const allowed =
    command === 'approve'
      ? access.role === 'owner' ||
        access.role === 'manager'
      : access.role === 'owner' ||
        access.role === 'manager' ||
        access.role === 'inventory_staff';

  if (!allowed) {
    return failure(
      'Your staff role does not permit this purchasing action.',
    );
  }

  try {
    const client = await createClient();

    const response = await client.rpc(
      command === 'approve'
        ? 'gr_operations'
        : 'gr_packaged_purchases',
      {
        p_action:
          command === 'approve'
            ? 'purchase.approve'
            : command,
        p_payload: payload,
      },
    );

    if (response.error) {
      const code = response.error.code;

      console.error(
        '[Golden Rose package purchasing]',
        { command, code },
      );

      if (code === '42501') {
        return failure(
          'Your staff permissions or active session do not permit this action.',
        );
      }

      if (
        ['22023', '22P02', '22007', '23505', 'P0002']
          .includes(code)
      ) {
        return failure(
          response.error.message.slice(0, 240),
        );
      }

      return failure(
        'The database did not confirm this operation. Check the purchase register before retrying.',
      );
    }

    const data = response.data;

    if (
      !data ||
      data.ok !== true ||
      typeof data.id !== 'string'
    ) {
      return failure(
        'The purchasing service returned an invalid confirmation.',
      );
    }

    revalidatePath('/workspace/purchases');
    revalidatePath(
      '/workspace/purchases/package-orders',
    );
    revalidatePath('/workspace/inventory');
    revalidatePath('/workspace/reports');

    const message =
      command === 'create'
        ? data.replayed
          ? 'This purchase was already created. No duplicate order was added.'
          : 'Draft purchase order saved successfully.'
        : command === 'approve'
          ? 'Purchase order approved successfully.'
          : data.replayed
            ? 'This delivery was already recorded. Stock was not added again.'
            : 'Stock receipt confirmed successfully.';

    return {
      status: 'success',
      message,
      id: data.id,
    };
  } catch {
    return failure(
      'The request could not complete. Refresh and check for an existing record before retrying.',
    );
  }
}

type SubmittedLine = {
  sku: string;
  quantity: string;
  unitCost: string;
  packageId: string;
};

export async function createPackagedOrder(
  _previous: PurchaseFeedback,
  form: FormData,
): Promise<PurchaseFeedback> {
  const supplierId = read(form, 'supplierId');
  const locationId = read(form, 'locationId');
  const requestKey = read(form, 'requestKey');
  const expectedDate = read(form, 'expectedDate');
  const note = read(form, 'note');

  if (
    !UUID.test(supplierId) ||
    !UUID.test(locationId) ||
    !UUID.test(requestKey) ||
    note.length > 500 ||
    (expectedDate && !validDate(expectedDate))
  ) {
    return failure(
      'Choose a valid supplier and location, and check the order details.',
    );
  }

  let submitted: SubmittedLine[];

  try {
    const parsed: unknown = JSON.parse(
      read(form, 'linesJson'),
    );

    if (
      !Array.isArray(parsed) ||
      parsed.length < 1 ||
      parsed.length > 40
    ) {
      return failure(
        'An order must contain between 1 and 40 product lines.',
      );
    }

    submitted = parsed as SubmittedLine[];
  } catch {
    return failure(
      'The product lines are invalid or incomplete.',
    );
  }

  const seen = new Set<string>();

  const lines: Array<{
    sku: string;
    quantity: number;
    baseUnitCostMinor: number;
    packageId: string | null;
  }> = [];

  for (const line of submitted) {
    if (
      !line ||
      typeof line.sku !== 'string' ||
      typeof line.quantity !== 'string' ||
      typeof line.unitCost !== 'string' ||
      typeof line.packageId !== 'string'
    ) {
      return failure('Invalid product line.');
    }

    const sku = line.sku.trim();
    const quantity = line.quantity.trim();
    const cost = nairaToKobo(line.unitCost);

    if (
      !sku ||
      sku.length > 100 ||
      seen.has(sku.toLowerCase()) ||
      !/^[1-9]\d{0,5}$/.test(quantity) ||
      Number(quantity) > 100000 ||
      cost === null ||
      cost <= 0 ||
      (
        line.packageId.length > 0 &&
        !UUID.test(line.packageId)
      )
    ) {
      return failure(
        `Invalid SKU, package, quantity or cost for ${sku || 'the selected product'}.`,
      );
    }

    seen.add(sku.toLowerCase());

    lines.push({
      sku,
      quantity: Number(quantity),
      baseUnitCostMinor: cost,
      packageId: line.packageId || null,
    });
  }

  return execute('create', {
    supplierId,
    locationId,
    requestKey,
    expectedDate: expectedDate || null,
    note,
    lines,
  });
}

export async function approvePackagedOrder(
  _previous: PurchaseFeedback,
  form: FormData,
): Promise<PurchaseFeedback> {
  const id = read(form, 'id');

  if (!UUID.test(id)) {
    return failure('Invalid purchase order.');
  }

  return execute('approve', { id });
}

export async function receivePackagedLine(
  _previous: PurchaseFeedback,
  form: FormData,
): Promise<PurchaseFeedback> {
  const lineId = read(form, 'lineId');
  const requestKey = read(form, 'requestKey');
  const quantity = read(form, 'quantity');

  if (
    !UUID.test(lineId) ||
    !UUID.test(requestKey) ||
    !/^[1-9]\d{0,5}$/.test(quantity) ||
    Number(quantity) > 100000
  ) {
    return failure(
      'Enter a valid delivery quantity.',
    );
  }

  return execute('receive', {
    lineId,
    requestKey,
    quantity: Number(quantity),
  });
}
