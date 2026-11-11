# Architecture — first iteration

## Unified web platform

**Public section:** `/`, `/shop`, `/shop/[slug]`, `/cart`, `/checkout`. A single luxury brand experience for customers.  
**Business section:** `/workspace`, `/workspace/[module]`. Preview UI now; production access will require server-verified sessions and module permissions.  
**Identity entry:** `/staff/sign-in`, to be connected to real authentication before private data is introduced.

The internal UI has owner/manager and staff/POS views; these are **permissioned views of the same business**, not separate tenants.

## Core modules

Overview & analytics; POS; sales/orders; invoices; products; inventory; purchases; suppliers; CRM/customers; reports; staff; AI assistant; settings; audit log. Module IDs and role permissions are defined in `packages/domain`.

## Intended implementation boundaries

- **Client UI:** React Server/Client Components, responsive pages, forms and shared design tokens.
- **Application services:** price calculation, order workflow, invoicing, stock transactions, supplier purchasing, payment reconciliation and authorization.
- **Database:** PostgreSQL with per-location stock, stock movement ledger, invoice lines, orders, payments, customers and audit events. Migrations pending real Odoo discovery.
- **External integrations:** payment processor, WhatsApp click-to-chat, later Odoo import, printing hardware, AI model and speech-to-text provider.
- **Future mobile:** Expo/React Native app using the same validated API and the shared domain package, with customer and staff modes protected server-side.

## Non-negotiable release gates

1. Real authentication and role checks on every sensitive server operation.
2. Atomic, idempotent stock/checkout and payment workflows.
3. Every invoice/refund/adjustment retains an audit trail; invoice numbering never duplicates.
4. Sanitized Odoo import dry run and reconciled opening stock.
5. Physical POS barcode/printer tests and cashier shift reconciliation.
6. Backups and a tested restore procedure, realistic load test, and a supervised store pilot.

**Current state:** visual skeleton and typed domain boundaries only. No production credentials, schema migrations or business data writes exist.

