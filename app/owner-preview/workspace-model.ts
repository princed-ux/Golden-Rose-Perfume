import {
  Box, ChartNoAxesCombined, ClipboardList, Database, House, Package, ReceiptText, ScanBarcode,
  Settings, ShieldCheck, Sparkles, Truck, UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { WorkspaceModuleId } from '@/src/domain/modules';

export const previewRoles = [
  { id: 'owner', label: 'Owner', scope: 'Executive overview and business administration' },
  { id: 'manager', label: 'Manager', scope: 'Authorized day-to-day operations' },
  { id: 'cashier', label: 'Cashier', scope: 'Point of sale and permitted sales operations' },
  { id: 'inventory_staff', label: 'Inventory Staff', scope: 'Stock control and receiving' },
  { id: 'accountant', label: 'Accountant', scope: 'Invoices, payment records and reporting' },
] as const;

export type PreviewRole = (typeof previewRoles)[number]['id'];

export const liveOnlyModules: PreviewModule[] = [
  { id: 'suppliers', label: 'Suppliers', icon: Truck, summary: 'Supplier relationships and contact records.', empty: 'Supplier records will appear when connected.' },
  { id: 'expenses', label: 'Expenses', icon: ReceiptText, summary: 'Review operating expenses and expense approvals.', empty: 'No expenses are available.' },
  { id: 'audit', label: 'Audit Log', icon: ShieldCheck, summary: 'Review changes to business records and permissions.', empty: 'The business audit feed is awaiting a connection.' },
  { id: 'migration', label: 'Data Management', icon: Database, summary: 'Map, validate and import business data.', empty: 'Choose an export to get started.' },
];

export type SuiteModuleId = WorkspaceModuleId | 'migration';

interface PreviewModule {
  id: SuiteModuleId;
  label: string;
  icon: LucideIcon;
  summary: string;
  empty: string;
}

export const previewModules: PreviewModule[] = [
  { id: 'overview', label: 'Executive Overview', icon: House,
    summary: 'Review the business across retail and online channels.', empty: 'Business reporting is awaiting a connection.' },
  { id: 'pos', label: 'Point of Sale', icon: ScanBarcode,
    summary: 'Ring up in-store purchases, record tenders and issue receipts.', empty: 'No register is connected to this preview.' },
  { id: 'products', label: 'Products & Catalogue', icon: Box,
    summary: 'Manage fragrances, variants, barcodes and storefront visibility.', empty: 'Catalogue management is outside this preview.' },
  { id: 'inventory', label: 'Inventory & Stock', icon: Package,
    summary: 'Review balances by location, receive stock and track adjustments.', empty: 'Stock alerts will appear when inventory reporting is connected.' },
  { id: 'orders', label: 'Sales & Orders', icon: ClipboardList,
    summary: 'Review recorded POS sales and confirmed orders. WhatsApp enquiries remain separate until staff confirm them.', empty: 'No recorded transactions are available in this preview.' },
  { id: 'customers', label: 'Customers (CRM)', icon: UsersRound,
    summary: 'Find customer profiles and follow up on verified purchase activity.', empty: 'Customer records are outside this preview.' },
  { id: 'invoices', label: 'Invoices & Quotes', icon: ReceiptText,
    summary: 'Review quotations, issued invoices and verified payment records.', empty: 'No invoices or quotes are available in this preview.' },
  { id: 'purchases', label: 'Purchasing & Suppliers', icon: Truck,
    summary: 'Prepare purchase orders, review receipts and manage supplier relationships with the appropriate permissions.', empty: 'No purchase orders are available in this preview.' },
  { id: 'reports', label: 'Reports & Analytics', icon: ChartNoAxesCombined,
    summary: 'Review recorded sales, margins and stock trends by period and channel.', empty: 'Reports will appear when verified business data is connected.' },
  { id: 'staff', label: 'Staff & Permissions', icon: ShieldCheck,
    summary: 'Review staff roles, invitations and location assignments.', empty: 'Staff administration is outside this preview.' },
  { id: 'assistant', label: 'Amara AI Assistant', icon: Sparkles,
    summary: 'Explore guided support for sales, stock, invoices and operations.', empty: 'The Amara panel has example questions for this role.' },
  { id: 'settings', label: 'Business Settings', icon: Settings,
    summary: 'Manage Golden Rose’s business identity, WhatsApp number, locations and operational preferences.', empty: 'Business settings are outside this preview.' },
];
