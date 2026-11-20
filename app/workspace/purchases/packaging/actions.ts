
'use server';

import { revalidatePath } from 'next/cache';

import { getStaffAccess } from '@/src/lib/golden-rose/staff';
import { UUID } from '@/src/lib/golden-rose/contracts';
import { createClient } from '@/src/lib/supabase/server';

type ActionFeedback = {
  status: 'idle' | 'success' | 'error';
  message: string;
};

function value(form: FormData, key: string): string {
  const item = form.get(key);

  return typeof item === 'string' ? item.trim() : '';
}

function failure(message: string): ActionFeedback {
  return { status: 'error', message };
}

async function execute(
  action: 'save' | 'deactivate',
  payload: Record<string, unknown>,
): Promise<ActionFeedback> {
  const access = await getStaffAccess();

  if ('reason' in access) {
    return failure(
      access.reason === 'unavailable'
        ? 'Staff verification is temporarily unavailable. Retry without signing out.'
        : 'Your session is no longer authorized. Sign in again.',
    );
  }

  if (
    access.role !== 'owner' &&
    access.role !== 'manager'
  ) {
    return failure(
      'Only the owner or an authorized manager can configure product packaging.',
    );
  }

  try {
    const client = await createClient();

    const { data, error } = await client.rpc(
      'gr_packaging',
      {
        p_action: action,
        p_payload: payload,
      },
    );

    if (error) {
      console.error('[Golden Rose packaging]', {
        action,
        code: error.code,
      });

      if (error.code === '42501') {
        return failure(
          'Your staff permissions or session do not permit this change.',
        );
      }

      if (
        error.code === '22023' ||
        error.code === '22P02'
      ) {
        return failure(
          'The product or package information is invalid. Review the selected SKU and quantities.',
        );
      }

      return failure(
        'The packaging service could not confirm the change. Refresh before retrying.',
      );
    }

    if (data?.ok !== true) {
      return failure(
        'The database did not confirm this operation.',
      );
    }

    revalidatePath('/workspace/purchases/packaging');

    return {
      status: 'success',
      message:
        action === 'save'
          ? 'Package conversion saved successfully.'
          : 'Package deactivated successfully.',
    };
  } catch {
    return failure(
      'The packaging request could not complete. Check the connection and retry.',
    );
  }
}

export async function savePackage(
  _previous: ActionFeedback,
  form: FormData,
): Promise<ActionFeedback> {
  const variantId = value(form, 'variantId');
  const unitName = value(form, 'unitName').toLowerCase();
  const units = value(form, 'unitsPerPackage');

  if (
    !UUID.test(variantId) ||
    !/^[a-z][a-z0-9 -]{1,31}$/.test(unitName) ||
    !/^[1-9]\d{0,5}$/.test(units) ||
    Number(units) < 2 ||
    Number(units) > 100000
  ) {
    return failure(
      'Enter a valid package name and a quantity between 2 and 100,000.',
    );
  }

  return execute('save', {
    variantId,
    unitName,
    unitsPerPackage: Number(units),
  });
}

export async function deactivatePackage(
  _previous: ActionFeedback,
  form: FormData,
): Promise<ActionFeedback> {
  const id = value(form, 'id');

  if (!UUID.test(id)) {
    return failure('Invalid package identifier.');
  }

  return execute('deactivate', { id });
}
