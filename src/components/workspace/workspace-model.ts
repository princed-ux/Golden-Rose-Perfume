
import {
  Box,
  ChartNoAxesCombined,
  ClipboardList,
  Database,
  House,
  Package,
  ReceiptText,
  ScanBarcode,
  Settings,
  ShieldCheck,
  Sparkles,
  Truck,
  UsersRound,
} from 'lucide-react';

import type { LucideIcon } from 'lucide-react';
import type { WorkspaceModuleId } from '@/src/domain/modules';

export const workspaceRoles = [
  {
    id: 'owner',
    label: 'Owner',
    scope: 'Executive oversight and full business administration',
  },
  {
    id: 'manager',
    label: 'Manager',
    scope: 'Authorized store and daily operations',
  },
  {
    id: 'cashier',
    label: 'Cashier',
    scope: 'Point of sale and calculator',
  },
  {
    id: 'inventory_staff',
    label: 'Inventory Staff',
    scope: 'Stock control, receiving and catalogue operations',
  },
  {
    id: 'sales_staff',
    label: 'Sales Staff',
    scope: 'Sales, orders and customer service',
  },
  {
    id: 'accountant',
    label: 'Accountant',
    scope: 'Invoices, expenses and financial reporting',
  },
] as const;

export type WorkspaceRole =
  (typeof workspaceRoles)[number]['id'];

export type SuiteModuleId =
  WorkspaceModuleId | 'migration';

export interface WorkspaceModule {
  id: SuiteModuleId;
  label: string;
  icon: LucideIcon;
  summary: string;
  empty: string;
}

export const coreWorkspaceModules: WorkspaceModule[] = [
  {
    id: 'overview',
    label: 'Executive Overview',
    icon: House,
    summary: 'Business performance, activities and operational health.',
    empty: 'Verified business reporting is being connected.',
  },
  {
    id: 'pos',
    label: 'Point of Sale',
    icon: ScanBarcode,
    summary: 'Barcode checkout, cash sales and receipts.',
    empty: 'Open the dedicated POS register.',
  },

  // Keep Staff Management prominently positioned.
  {
    id: 'staff',
    label: 'Staff Management',
    icon: UsersRound,
    summary:
      'Manage employees, workspace roles, store access and owner accounts.',
    empty: 'Open the dedicated staff administration page.',
  },

  {
    id: 'products',
    label: 'Products & Catalogue',
    icon: Box,
    summary:
      'Manage fragrances, sizes, variants, prices and barcodes.',
    empty: 'Connect the product catalogue.',
  },
  {
    id: 'inventory',
    label: 'Inventory & Stock',
    icon: Package,
    summary:
      'Monitor stock by location, receiving and adjustments.',
    empty: 'Inventory records will appear here.',
  },
  {
    id: 'orders',
    label: 'Sales & Orders',
    icon: ClipboardList,
    summary:
      'Review in-store sales and confirmed online orders.',
    empty: 'Verified transaction records will appear here.',
  },
  {
    id: 'customers',
    label: 'Customers (CRM)',
    icon: UsersRound,
    summary:
      'Customer records, purchase history and follow-ups.',
    empty: 'Customer records will appear here.',
  },
  {
    id: 'invoices',
    label: 'Invoices & Quotes',
    icon: ReceiptText,
    summary:
      'Create invoices, issue quotations and track payments.',
    empty: 'Invoice records will appear here.',
  },
  {
    id: 'purchases',
    label: 'Purchasing',
    icon: Truck,
    summary:
      'Purchase orders, supplier relations and goods received.',
    empty: 'Purchasing records will appear here.',
  },
  {
    id: 'reports',
    label: 'Reports & Analytics',
    icon: ChartNoAxesCombined,
    summary:
      'Sales, revenue, profitability and stock performance.',
    empty: 'Reporting will use verified operational data.',
  },
  {
    id: 'assistant',
    label: 'Amara AI Assistant',
    icon: Sparkles,
    summary:
      'Guided assistance for business operations.',
    empty: 'Open Amara from the floating assistant button.',
  },
  {
    id: 'settings',
    label: 'Business Settings',
    icon: Settings,
    summary:
      'Business information, WhatsApp, locations and preferences.',
    empty: 'Business settings will appear here.',
  },
];

export const additionalWorkspaceModules: WorkspaceModule[] = [
  {
    id: 'suppliers',
    label: 'Suppliers',
    icon: Truck,
    summary: 'Supplier contacts, relationships and purchasing records.',
    empty: 'Supplier records will appear here.',
  },
  {
    id: 'expenses',
    label: 'Expenses',
    icon: ReceiptText,
    summary: 'Operating costs, receipts and expense approval.',
    empty: 'Expense records will appear here.',
  },
  {
    id: 'audit',
    label: 'Audit Log',
    icon: ShieldCheck,
    summary: 'Recorded changes to business data and permissions.',
    empty: 'Audited activities will appear here.',
  },
  {
    id: 'migration',
    label: 'Data Management',
    icon: Database,
    summary: 'Import and validate business records.',
    empty: 'Choose an export to get started.',
  },
];

export const workspaceModules = [...coreWorkspaceModules, ...additionalWorkspaceModules];
