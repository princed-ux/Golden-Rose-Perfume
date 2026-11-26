/**
 * GOLDEN ROSE PERFUME
 *
 * Resolve navigation from verified employee permissions.
 * Navigation is presentation only; database authorization
 * remains authoritative.
 */

export type DelegatedModuleId =
  | 'wholesale'
  | 'dispatch'
  | 'invoices'
  | 'permissions';

export interface VerifiedStaffIdentity {
  userId: string;
  role: string;
}

const staffRoles = new Set([
  'owner',
  'manager',
  'cashier',
  'inventory_staff',
  'sales_staff',
  'accountant',
]);

export function delegatedNavigation(
  staff: VerifiedStaffIdentity,
  access: unknown,
): DelegatedModuleId[] {
  if (!staffRoles.has(staff.role)) {
    return [];
  }

  const modules: DelegatedModuleId[] = [];

  if (
    access &&
    typeof access === 'object' &&
    !Array.isArray(access)
  ) {
    const value =
      access as Record<string, unknown>;

    /*
     * Permission information must belong to the
     * current authenticated employee.
     */

    if (
      value.userId === staff.userId &&
      value.role === staff.role &&
      typeof value.wholesaleAllowed === 'boolean' &&
      typeof value.dispatchAllowed === 'boolean' &&
      typeof value.invoiceAllowed === 'boolean' &&
      value.assistantAllowed === true
    ) {
      if (value.wholesaleAllowed) {
        modules.push('wholesale');
      }

      if (value.dispatchAllowed) {
        modules.push('dispatch');
      }

      if (value.invoiceAllowed) {
        modules.push('invoices');
      }
    }
  }

  /*
   * Only the owner receives permission administration.
   * This page remains visible if the permission service
   * is temporarily unavailable.
   */

  if (staff.role === 'owner') {
    modules.push('permissions');
  }

  return modules;
}