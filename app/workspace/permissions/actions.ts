'use server';

import { revalidatePath } from 'next/cache';

import { ROLES } from '@/src/domain/types';

import {
  UUID,
  type StaffRole,
} from '@/src/lib/golden-rose/contracts';

import {
  getStaffAccess,
} from '@/src/lib/golden-rose/staff';

import {
  createClient,
} from '@/src/lib/supabase/server';

/* =========================================================
   GOLDEN ROSE — EMPLOYEE ACCESS MANAGEMENT
   ========================================================= */

export type EditableModule =
  | 'wholesale'
  | 'dispatch'
  | 'invoices';

export type EmployeePermissionOverrides = Partial<
  Record<EditableModule, 'allow' | 'deny'>
>;

const editableModules: readonly EditableModule[] = [
  'wholesale',
  'dispatch',
  'invoices',
];

type Failure = {
  ok: false;
  message: string;
};

export type PermissionResult<T> =
  | {
      ok: true;
      data: T;
    }
  | Failure;

export interface EmployeePermissionRecord {
  userId: string;
  email: string | null;
  displayName: string;
  role: Exclude<StaffRole, 'owner'>;
  status: 'active' | 'suspended';
  locationId: string | null;
  locationName: string | null;
  revision: number;
  overrides: EmployeePermissionOverrides;
}

export interface PermissionDirectory {
  items: EmployeePermissionRecord[];
  editableModules: EditableModule[];
}

export interface MyStaffPermissions {
  userId: string;
  role: StaffRole;
  revision: number;
  overrides: EmployeePermissionOverrides;
  wholesaleAllowed: boolean;
  dispatchAllowed: boolean;
  invoiceAllowed: boolean;
  assistantAllowed: boolean;
}

export interface SavePermissionsInput {
  employeeId: string;
  expectedRevision: number;
  overrides: EmployeePermissionOverrides;
}

export interface SavedPermissions {
  userId: string;
  revision: number;
  overrides: EmployeePermissionOverrides;
}

/* =========================================================
   VALIDATION
   ========================================================= */

function failed(message: string): Failure {
  return {
    ok: false,
    message,
  };
}

function record(
  value: unknown,
): Record<string, unknown> | null {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
    ? value as Record<string, unknown>
    : null;
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function validRevision(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 999_999_999
  );
}

function validRole(value: unknown): value is StaffRole {
  return (
    value !== 'customer' &&
    ROLES.some(role => role === value)
  );
}

function nullableString(
  value: unknown,
): value is string | null {
  return value === null || typeof value === 'string';
}

function isEditableModule(
  value: unknown,
): value is EditableModule {
  return editableModules.some(item => item === value);
}

function parseOverrides(
  value: unknown,
): EmployeePermissionOverrides {
  const input = record(value);

  if (!input) {
    throw new Error('Invalid employee access configuration.');
  }

  const result: EmployeePermissionOverrides = {};

  for (const [key, decision] of Object.entries(input)) {
    if (
      !isEditableModule(key) ||
      (decision !== 'allow' && decision !== 'deny')
    ) {
      throw new Error('Unsupported permission selection.');
    }

    result[key] = decision;
  }

  return result;
}

function sameOverrides(
  left: EmployeePermissionOverrides,
  right: EmployeePermissionOverrides,
): boolean {
  return editableModules.every(
    key => left[key] === right[key],
  );
}

/* =========================================================
   AUTHENTICATED RPC
   ========================================================= */

type PermissionAction =
  | 'own_v2'
  | 'list_v2'
  | 'save_v2';

async function requestPermissions(
  action: PermissionAction,
  payload: Record<string, unknown> = {},
): Promise<PermissionResult<Record<string, unknown>>> {
  try {
    const staff = await getStaffAccess();

    if ('reason' in staff) {
      return failed('An active employee session is required.');
    }

    if (
      action !== 'own_v2' &&
      staff.role !== 'owner'
    ) {
      return failed(
        'Only the business owner can manage employee access.',
      );
    }

    const client = await createClient();

    const { data, error } = await client.rpc(
      'gr_staff_permissions',
      {
        p_action: action,
        p_payload: payload,
      },
    );

    if (error) {
      if (['42501', 'GR403'].includes(error.code)) {
        return failed(
          'You are not authorized to perform this operation.',
        );
      }

      if (error.code === '40001') {
        return failed(
          'Permissions changed in another session. Reload the employee record and try again.',
        );
      }

      if (['22023', '22P02'].includes(error.code)) {
        return failed(
          'Check the employee and permission selections.',
        );
      }

      console.error('[Golden Rose permissions]', {
        action,
        code: error.code,
      });

      return failed(
        'The permission service is temporarily unavailable.',
      );
    }

    const result = record(data);

    if (!result || result.ok !== true) {
      return failed(
        'The permission response could not be verified.',
      );
    }

    if (
      action === 'own_v2' &&
      (
        result.userId !== staff.userId ||
        result.role !== staff.role
      )
    ) {
      return failed(
        'The permission response does not match the current employee.',
      );
    }

    return {
      ok: true,
      data: result,
    };

  } catch {
    return failed(
      'Unable to verify employee access. Please retry.',
    );
  }
}

/* =========================================================
   CURRENT EMPLOYEE PERMISSIONS
   ========================================================= */

export async function loadMyPermissions(): Promise<
  PermissionResult<MyStaffPermissions>
> {
  const result = await requestPermissions('own_v2');

  if (!result.ok) {
    return result;
  }

  const data = result.data;

  if (
    !validId(data.userId) ||
    !validRole(data.role) ||
    !validRevision(data.revision) ||
    typeof data.wholesaleAllowed !== 'boolean' ||
    typeof data.dispatchAllowed !== 'boolean' ||
    typeof data.invoiceAllowed !== 'boolean' ||
    data.assistantAllowed !== true
  ) {
    return failed(
      'The employee permission record is incomplete.',
    );
  }

  try {
    return {
      ok: true,

      data: {
        userId: data.userId,
        role: data.role,
        revision: data.revision,
        overrides: parseOverrides(data.overrides),
        wholesaleAllowed: data.wholesaleAllowed,
        dispatchAllowed: data.dispatchAllowed,
        invoiceAllowed: data.invoiceAllowed,
        assistantAllowed: data.assistantAllowed,
      },
    };

  } catch {
    return failed(
      'The employee permission configuration is invalid.',
    );
  }
}

/* =========================================================
   EMPLOYEE DIRECTORY
   ========================================================= */

function parseEmployee(
  value: unknown,
): EmployeePermissionRecord | null {
  const item = record(value);

  if (
    !item ||
    !validId(item.userId) ||
    !nullableString(item.email) ||
    typeof item.displayName !== 'string' ||
    !validRole(item.role) ||
    item.role === 'owner' ||
    (
      item.status !== 'active' &&
      item.status !== 'suspended'
    ) ||
    (
      item.locationId !== null &&
      !validId(item.locationId)
    ) ||
    !nullableString(item.locationName) ||
    !validRevision(item.revision)
  ) {
    return null;
  }

  try {
    return {
      userId: item.userId,
      email: item.email,
      displayName: item.displayName,
      role: item.role,
      status: item.status,
      locationId: item.locationId,
      locationName: item.locationName,
      revision: item.revision,
      overrides: parseOverrides(item.overrides),
    };

  } catch {
    return null;
  }
}

export async function loadPermissionDirectory(): Promise<
  PermissionResult<PermissionDirectory>
> {
  const result = await requestPermissions('list_v2');

  if (!result.ok) {
    return result;
  }

  const { items, editableModules: available } =
    result.data;

  if (
    !Array.isArray(items) ||
    !Array.isArray(available) ||
    !available.every(isEditableModule) ||
    available.length !== editableModules.length ||
    new Set(available).size !== available.length
  ) {
    return failed(
      'The supported permission configuration could not be verified.',
    );
  }

  const employees: EmployeePermissionRecord[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const employee = parseEmployee(item);

    if (!employee || seen.has(employee.userId)) {
      return failed(
        'One or more employee records could not be verified.',
      );
    }

    seen.add(employee.userId);
    employees.push(employee);
  }

  return {
    ok: true,

    data: {
      items: employees,
      editableModules: available,
    },
  };
}

/* =========================================================
   SAVE ACCESS
   ========================================================= */

export async function saveStaffPermissions(
  input: SavePermissionsInput,
): Promise<PermissionResult<SavedPermissions>> {
  if (
    !input ||
    !validId(input.employeeId) ||
    !validRevision(input.expectedRevision)
  ) {
    return failed(
      'Select a valid employee and permission revision.',
    );
  }

  let overrides: EmployeePermissionOverrides;

  try {
    overrides = parseOverrides(input.overrides);

  } catch {
    return failed(
      'One or more permission selections are invalid.',
    );
  }

  const result = await requestPermissions(
    'save_v2',
    {
      employeeId: input.employeeId,
      expectedRevision: input.expectedRevision,
      overrides,
    },
  );

  if (!result.ok) {
    return result;
  }

  const data = result.data;

  if (
    !validId(data.userId) ||
    data.userId.toLowerCase() !==
      input.employeeId.toLowerCase() ||
    !validRevision(data.revision)
  ) {
    return failed(
      'Permission changes could not be confirmed. Reload the employee record.',
    );
  }

  let saved: EmployeePermissionOverrides;

  try {
    saved = parseOverrides(data.overrides);

  } catch {
    return failed(
      'The saved permission configuration is invalid.',
    );
  }

  if (!sameOverrides(overrides, saved)) {
    return failed(
      'The saved permissions differ from the requested configuration.',
    );
  }

  /*
   * A cache refresh failure must not incorrectly report
   * an already acknowledged database write as failed.
   */

  try {
    revalidatePath('/workspace/permissions');
    revalidatePath('/workspace/staff');
    revalidatePath('/workspace', 'layout');

  } catch {
    console.error(
      '[Golden Rose permissions] Workspace refresh failed.',
    );
  }

  return {
    ok: true,

    data: {
      userId: data.userId,
      revision: data.revision,
      overrides: saved,
    },
  };
}