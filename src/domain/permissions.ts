import type { Role } from './types';
import type { WorkspaceModuleId } from './modules';

/** Destination policy for future verified sessions. This does not authenticate a user. */
export function getRoleHome(role: Role): '/account' | '/workspace' {
  return role === 'customer' ? '/account' : '/workspace';
}

/** Planned UI visibility only. Production endpoints must enforce authorization server-side. */
export const ROLE_MODULES: Record<Exclude<Role, 'customer'>, readonly WorkspaceModuleId[]> = {
  owner: ['overview', 'pos', 'orders', 'invoices', 'expenses', 'products', 'inventory', 'purchases', 'suppliers', 'customers', 'reports', 'assistant', 'staff', 'settings', 'audit'],
  manager: ['overview', 'pos', 'orders', 'invoices', 'expenses', 'products', 'inventory', 'purchases', 'suppliers', 'customers', 'reports', 'assistant', 'staff'],
  cashier: ['overview', 'pos', 'orders', 'invoices', 'products', 'inventory', 'customers'],
  inventory_staff: ['overview', 'products', 'inventory', 'purchases', 'suppliers'],
  sales_staff: ['overview', 'pos', 'orders', 'products', 'inventory', 'customers'],
  accountant: ['overview', 'orders', 'invoices', 'expenses', 'purchases', 'reports'],
};

export function canViewModule(role: Role, moduleId: WorkspaceModuleId): boolean {
  if (role === 'customer') return false;
  return ROLE_MODULES[role]?.includes(moduleId) ?? false;
}
