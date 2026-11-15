export const employeeRoles = {
  manager: 'Manager',
  cashier: 'Cashier',
  inventory_staff: 'Inventory Staff',
  sales_staff: 'Sales Staff',
  accountant: 'Accountant',
} as const;

export type EmployeeRole = keyof typeof employeeRoles;
export const employeeInviteCode = /^[a-zA-Z0-9_-]{43}$/;

export function isEmployeeRole(value: string): value is EmployeeRole {
  return Object.hasOwn(employeeRoles, value);
}

export type StaffDirectory = {
  employees: {
    id: string; fullName: string; email: string; username: string | null;
    role: EmployeeRole; locationId: string | null; status: 'active' | 'suspended' | 'revoked';
  }[];
  locations: { id: string; name: string; active: boolean }[];
  invitations: {
    id: string; fullName: string; email: string; role: EmployeeRole; locationId: string;
    status: 'pending' | 'accepted' | 'expired' | 'revoked'; expiresAt: string;
  }[];
  audit: {
    id: string; actor: string; subject: string; action: string; createdAt: string;
    detail: { fromRole?: EmployeeRole; role?: EmployeeRole; fromStore?: string | null; store?: string };
  }[];
};
