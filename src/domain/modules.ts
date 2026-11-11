export const WORKSPACE_MODULES = [
  { id: 'overview', label: 'Overview', section: 'general', description: 'Sales, tasks and operational health.' },
  { id: 'pos', label: 'Point of Sale', section: 'operations', description: 'Barcode sales, tender, receipts and shifts.' },
  { id: 'orders', label: 'Orders & Sales', section: 'operations', description: 'POS, web, mobile and WhatsApp orders.' },
  { id: 'invoices', label: 'Invoices', section: 'operations', description: 'Draft, issue and reconcile customer invoices.' },
  { id: 'expenses', label: 'Expenses', section: 'operations', description: 'Operating costs, receipts and expense approval planning.' },
  { id: 'products', label: 'Products', section: 'catalog', description: 'Fragrances, sizes, prices and barcodes.' },
  { id: 'inventory', label: 'Inventory', section: 'catalog', description: 'Stock, receiving, counting and adjustments.' },
  { id: 'purchases', label: 'Purchasing', section: 'catalog', description: 'Supplier purchase orders and receiving.' },
  { id: 'suppliers', label: 'Suppliers', section: 'catalog', description: 'Supplier contacts and purchase history.' },
  { id: 'customers', label: 'Customer CRM', section: 'customers', description: 'Customer profiles, orders and follow-ups.' },
  { id: 'reports', label: 'Reports', section: 'insights', description: 'Sales, gross margins, stock and channel metrics.' },
  { id: 'assistant', label: 'AI Assistant', section: 'insights', description: 'Planned permission-aware business questions and voice.' },
  { id: 'staff', label: 'Staff & Roles', section: 'administration', description: 'People, access, assigned locations and permissions.' },
  { id: 'settings', label: 'Business Settings', section: 'administration', description: 'Brand, payment, WhatsApp and operation settings.' },
  { id: 'audit', label: 'Audit Log', section: 'administration', description: 'Recorded financial and inventory changes.' },
] as const;

export type WorkspaceModuleId = (typeof WORKSPACE_MODULES)[number]['id'];

export function getWorkspaceModule(id: string) {
  return WORKSPACE_MODULES.find((module) => module.id === id);
}

