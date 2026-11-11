# Build roadmap — web first

## M0: UI foundation (this scaffold)

- [x] Dedicated single-business monorepo and domain boundaries.
- [x] Web customer/storefront routes.
- [x] Internal dashboard/module navigation with mock data.
- [x] Invoices, suppliers, CRM and AI modules explicitly represented.
- [x] Role capability matrix and basic tests.
- [x] TypeScript check, four module-permission tests and optimized Next.js build pass in the setup environment.
- [ ] Figma-approved branding and full screens.

**Environment note:** A local HTTP smoke test could not start here because the host returned `uv_interface_addresses` / `ERR_SYSTEM_ERROR` while Next.js read the container's network interfaces. The static compilation, generated routes and TypeScript checks passed; test in a normal local Windows/WSL/macOS runtime after extraction.

## M1: Approved UI and real authentication

- [ ] Customer website Figma reference plus internal ERP/POS reference.
- [ ] Responsive components, forms, interaction states, accessibility audit.
- [ ] Real staff login, MFA decision, invitation and session/logout paths.
- [ ] Server-verified role and location guards; remove public workspace previews before real data.

## M2: Retail core and data import

- [ ] Design audited PostgreSQL schema/migrations based on actual client/Odoo rules.
- [ ] Import preview, dry run, duplicate checks and stock reconciliation.
- [ ] Products, variants, barcode, stock movements, purchasing and suppliers.
- [ ] POS with scanning, shifts, tender reconciliation, receipt printing and returns.
- [ ] Sales invoices, draft/issue/payment/credit note and PDF export.

## M3: Online business and CRM

- [ ] Storefront cart, checkout, verified provider webhook and stock reservation.
- [ ] Three admin-configured WhatsApp recipient numbers and pending inquiry orders.
- [ ] Customer accounts, order tracking, CRM interactions and owner reports.

## M4: AI + mobile + launch

- [ ] Read-only data-grounded, permission-aware AI tools (numbers must cite actual records/time window).
- [ ] Decide speech-to-text/voice controls and consent, then prototype.
- [ ] Expo mobile app for customers and role-limited staff functions.
- [ ] Field hardware UAT, concurrent checkout test, backup restore and store pilot.

### Questions still blocking production features

Odoo access/version, branches/stockrooms, payment provider, hardware, tax/invoice numbering, returns policies, internet/offline requirements, brand assets, AI model/provider and whether voice input is intended.

