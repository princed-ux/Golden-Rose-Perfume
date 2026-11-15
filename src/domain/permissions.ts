
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

export function getRoleHome(role: Role) { return roleHomes[role]; }

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
    'products',
    'inventory',
    'purchases',
    'suppliers',
  ],

  sales_staff: [
    'orders',
    'products',
    'customers',
  ],

  accountant: [
    'invoices',
    'expenses',
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
