/**
 * GOLDEN ROSE PERFUME
 *
 * Individual module access policy.
 *
 * The server supplies the verified role and
 * permission overrides stored for that employee.
 */

export const PERMISSION_MODULES = [
  'overview',
  'pos',
  'orders',
  'invoices',
  'expenses',
  'products',
  'inventory',
  'purchases',
  'suppliers',
  'customers',
  'reports',
  'assistant',
  'staff',
  'settings',
  'audit',
  'wholesale',
  'dispatch',
  'permissions',
] as const;

export type PermissionModule =
  typeof PERMISSION_MODULES[number];

export type PermissionDecision =
  | 'allow'
  | 'deny';

export type PermissionOverrides =
  Partial<
    Record<
      PermissionModule,
      PermissionDecision
    >
  >;

/**
 * Prevent employees from escalating their own
 * privileges or accessing owner administration.
 */

const ownerOnly =
  new Set<PermissionModule>([
    'staff',
    'settings',
    'audit',
    'permissions',
  ]);

const employeeRoles = new Set([
  'manager',
  'cashier',
  'inventory_staff',
  'sales_staff',
  'accountant',
]);

const known = new Set<string>(
  PERMISSION_MODULES,
);

/**
 * Reject unknown, malformed or owner-only
 * permission overrides.
 *
 * An absent key inherits the role default.
 */

export function parsePermissionOverrides(
  value: unknown,
): PermissionOverrides {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new Error(
      'Invalid permission record.',
    );
  }

  const result: PermissionOverrides = {};

  for (
    const [key, decision]
    of Object.entries(value)
  ) {
    if (
      !known.has(key) ||

      ownerOnly.has(
        key as PermissionModule,
      ) ||

      (
        decision !== 'allow' &&
        decision !== 'deny'
      )
    ) {
      throw new Error(
        'Invalid or protected permission.',
      );
    }

    result[key as PermissionModule] =
      decision;
  }

  return result;
}

/**
 * Resolve the effective permissions for an
 * authenticated employee.
 *
 * Role defaults must come from the existing
 * trusted ROLE_MODULES table, never from a
 * browser request.
 *
 * An unavailable or invalid permission record
 * must not be replaced with an empty one.
 *
 * Call only after active membership, identity,
 * session and location checks.
 */

export function resolveStaffModules(
  role: string,

  roleDefaults: readonly string[],

  storedOverrides: unknown,
): PermissionModule[] {
  /*
   * Owner access cannot be accidentally revoked
   * through employee permission configuration.
   */

  if (role === 'owner') {
    return [...PERMISSION_MODULES];
  }

  /*
   * Customers and unknown roles cannot enter
   * internal business modules.
   */

  if (!employeeRoles.has(role)) {
    return [];
  }

  const overrides =
    parsePermissionOverrides(
      storedOverrides,
    );

  const defaults = new Set(
    roleDefaults,
  );

  return PERMISSION_MODULES.filter(
    module =>
      !ownerOnly.has(module) &&

      (
        overrides[module] === 'allow' ||

        (
          overrides[module] !== 'deny' &&
          defaults.has(module)
        )
      ),
  );
}

/**
 * Permission configuration is owner-only.
 */

export function canConfigurePermissions(
  role: string,
): boolean {
  return role === 'owner';
}