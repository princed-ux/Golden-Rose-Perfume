import type { Role } from './types';
import type { WorkspaceModuleId } from './modules';

const roleHomes = {
  customer: '/account',
  owner: '/workspace',
  manager: '/workspace',
  cashier: '/workspace/pos',
  inventory_staff: '/workspace/inventory',
  sales_staff: '/workspace/orders',
  accountant: '/workspace/invoices',
} satisfies Record<Role, string>;

export function getRoleHome(role: Role) {
  return roleHomes[role];
}

/*
 * Default role permissions.
 *
 * Individual employee permissions are resolved separately
 * from the verified database permission service.
 *
 * A delegated module must not change the employee's role.
 */

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

  cashier: [
    'pos',
    'assistant',
  ],

  inventory_staff: [
    'products',
    'inventory',
    'purchases',
    'suppliers',
    'assistant',
  ],

  sales_staff: [
    'orders',
    'products',
    'customers',
    'assistant',
  ],

  accountant: [
    'invoices',
    'expenses',
    'reports',
    'assistant',
  ],
};

export function canViewModule(
  role: Role,
  moduleId: WorkspaceModuleId,
): boolean {
  if (role === 'customer') {
    return false;
  }

  return (
    ROLE_MODULES[role]?.includes(moduleId) ??
    false
  );
}