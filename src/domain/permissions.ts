
import type { Role } from './types';
import type { WorkspaceModuleId } from './modules';

export function getRoleHome(
  role: Role,
): '/account' | '/workspace' | '/workspace/pos' {
  if (role === 'customer') return '/account';
  if (role === 'cashier') return '/workspace/pos';
  return '/workspace';
}

export const ROLE_MODULES: Record<
  Exclude<Role, 'customer'>,
  readonly WorkspaceModuleId[]
> = {
  owner: [
    'overview',
    'pos',
    'staff',
    'products',
    'inventory',
    'orders',
    'customers',
    'invoices',
    'purchases',
    'reports',
    'assistant',
    'settings',
    'suppliers',
    'expenses',
    'audit',
  ],

  manager: [
    'overview',
    'pos',
    'products',
    'inventory',
    'orders',
    'customers',
    'invoices',
    'purchases',
    'reports',
    'assistant',
    'suppliers',
    'expenses',
  ],

  // Register-only workspace.
  cashier: ['pos'],

  inventory_staff: [
    'overview',
    'products',
    'inventory',
    'purchases',
    'suppliers',
  ],

  sales_staff: [
    'overview',
    'pos',
    'orders',
    'products',
    'inventory',
    'customers',
  ],

  accountant: [
    'overview',
    'orders',
    'invoices',
    'expenses',
    'purchases',
    'reports',
  ],
};

export function canViewModule(
  role: Role,
  moduleId: WorkspaceModuleId,
): boolean {
  if (role === 'customer') return false;
  return ROLE_MODULES[role]?.includes(moduleId) ?? false;
}
