import type { WorkspaceModuleId } from '@/src/domain';

export interface ModulePreview {
  note: string;
  headers: readonly string[];
  rows: readonly (readonly string[])[];
  tags: readonly string[];
}

/** All values below are invented UI examples. These are not live transactions. */
export const modulePreviews: Record<WorkspaceModuleId, ModulePreview> = {
  overview: {
    note: 'The business summary will be filtered by location, date, channel and user permissions.',
    headers: ['Activity', 'Channel', 'Status'],
    rows: [['Sample sale #1001', 'POS', 'Paid'], ['Sample order #1002', 'Web', 'Preparing'], ['Stock review task', 'Inventory', 'Pending']],
    tags: ['Today', 'Last 7 days', 'Last 30 days'],
  },
  pos: {
    note: 'Future POS flow: open shift, scan SKU, calculate totals, record tender and issue receipt.',
    headers: ['Quick action', 'Input', 'Status'],
    rows: [['Open register', 'Assigned location', 'Planned'], ['Scan product barcode', 'USB / camera', 'Planned'], ['Print receipt', 'Thermal printer', 'Planned']],
    tags: ['Barcode', 'Cash', 'Transfer', 'Card', 'Shift close'],
  },
  orders: {
    note: 'The order queue will unify POS, website, mobile and WhatsApp inquiries.',
    headers: ['Example reference', 'Channel', 'Status'],
    rows: [['DEMO-ORD-101', 'Online', 'Preparing'], ['DEMO-ORD-102', 'POS', 'Paid'], ['DEMO-ORD-103', 'WhatsApp', 'Inquiry']],
    tags: ['POS', 'Online', 'WhatsApp', 'Refunds'],
  },
  invoices: {
    note: 'Invoices have draft, issued, partially paid, paid and void states. PDF and numbering services are not built yet.',
    headers: ['Illustrative invoice', 'Customer', 'Status'],
    rows: [['DEMO-INV-001', 'Walk-in sample', 'Draft'], ['DEMO-INV-002', 'Retail sample', 'Issued'], ['DEMO-INV-003', 'Wholesale sample', 'Partially paid']],
    tags: ['Drafts', 'Issued', 'Payments', 'Credit notes'],
  },
  expenses: {
    note: 'Expense tracking will connect operating costs, supporting receipts and manager approval. No expenses are recorded in this preview.',
    headers: ['Planned category', 'Required information', 'State'],
    rows: [['Rent and utilities', 'Supplier, date and receipt', 'Planned'], ['Operating supplies', 'Category, amount and receipt', 'Planned'], ['Staff reimbursements', 'Requester and approval', 'Planned']],
    tags: ['Categories', 'Receipts', 'Approvals', 'Expense reports'],
  },
  products: {
    note: 'Catalog variants will preserve SKU, barcode, brand, concentration, volume and price.',
    headers: ['Illustrative product', 'SKU', 'Price'],
    rows: [['Rose & Oud 50 ml', 'DEMO-RO-50', '₦38,500'], ['Amber Bloom 100 ml', 'DEMO-AB-100', '₦52,000'], ['Velvet Musk 50 ml', 'DEMO-VM-50', '₦44,500']],
    tags: ['Brands', 'Variants', 'Barcodes', 'Odoo import'],
  },
  inventory: {
    note: 'Inventory will use audited movements, available vs reserved stock, counts and location balances.',
    headers: ['Illustrative SKU', 'On hand', 'Available'],
    rows: [['DEMO-RO-50', '28', '26'], ['DEMO-AB-100', '10', '8'], ['DEMO-VM-50', '4', '4']],
    tags: ['Low stock', 'Receiving', 'Adjustments', 'Transfers'],
  },
  purchases: {
    note: 'Create supplier purchase orders, receive quantities and reconcile the resulting inventory movement.',
    headers: ['Illustrative PO', 'Supplier', 'Status'],
    rows: [['DEMO-PO-101', 'Supplier Alpha', 'Approved'], ['DEMO-PO-102', 'Supplier Beta', 'Partially received'], ['DEMO-PO-103', 'Supplier Gamma', 'Draft']],
    tags: ['Purchase orders', 'Receiving', 'Costs'],
  },
  suppliers: {
    note: 'Supplier master records will connect purchases, costs, communications and outstanding deliveries.',
    headers: ['Sample supplier', 'Specialty', 'Status'],
    rows: [['Supplier Alpha', 'Fragrance wholesale', 'Active'], ['Supplier Beta', 'Packaging', 'Active'], ['Supplier Gamma', 'General supply', 'Review']],
    tags: ['Contacts', 'Terms', 'Purchase history'],
  },
  customers: {
    note: 'CRM includes profiles, purchase history, service notes and optional leads/follow-ups.',
    headers: ['Sample customer', 'Relationship', 'Recent activity'],
    rows: [['Customer 001', 'Retail', 'Order inquiry'], ['Customer 002', 'Wholesale', 'Invoice issued'], ['Customer 003', 'Retail', 'Repeat purchase']],
    tags: ['Profiles', 'History', 'Follow-ups', 'Segments'],
  },
  reports: {
    note: 'Profit reports will distinguish gross margin from net profit and label the cost basis.',
    headers: ['Example report', 'Period', 'Status'],
    rows: [['Sales by channel', 'Today', 'Planned'], ['Stock valuation', 'Current', 'Planned'], ['Receivables', 'This month', 'Planned']],
    tags: ['Sales', 'Margins', 'Inventory', 'Export'],
  },
  assistant: {
    note: 'The AI will answer only through authorized, date-scoped business-data tools. Model and voice integrations are not connected.',
    headers: ['Example request', 'Required source', 'State'],
    rows: [['How many units sold today?', 'Verified sales', 'Planned'], ['Which items are low in stock?', 'Stock balances', 'Planned'], ['Show unpaid invoices', 'Invoices and payments', 'Planned']],
    tags: ['Read-only first', 'Voice input later', 'Permission aware'],
  },
  staff: {
    note: 'Roles, assigned locations and sensitive approval workflows will require server-enforced authorization.',
    headers: ['Sample role', 'Primary workspace', 'Access'],
    rows: [['Owner', 'All authorized modules', 'Full'], ['Cashier', 'POS and assigned sales', 'Limited'], ['Stock clerk', 'Inventory and purchasing', 'Limited']],
    tags: ['Roles', 'Invitations', 'Locations', 'Approvals'],
  },
  settings: {
    note: 'Store settings will cover business details, locations, invoice numbering, taxes and three WhatsApp routing numbers.',
    headers: ['Configuration', 'Example', 'State'],
    rows: [['Business profile', 'Golden Rose Perfume', 'Pending'], ['WhatsApp recipients', 'Up to 3 numbers', 'Pending'], ['Invoice sequence', 'Owner-defined', 'Pending']],
    tags: ['Business', 'Payments', 'WhatsApp', 'Invoices'],
  },
  audit: {
    note: 'Sensitive inventory, financial and permission changes must retain actor, time, reason and before/after data.',
    headers: ['Illustrative event', 'Performed by', 'Status'],
    rows: [['Stock count approved', 'Manager sample', 'Logged'], ['Refund requested', 'Cashier sample', 'Pending'], ['Role updated', 'Owner sample', 'Logged']],
    tags: ['Activity', 'Approvals', 'Exceptions'],
  },
};

