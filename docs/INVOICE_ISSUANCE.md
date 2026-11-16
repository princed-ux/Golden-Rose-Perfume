# Invoice Studio billing release

The Studio at /workspace/invoices saves drafts, retains accepted quotations, and issues numbered invoices using a private PostgreSQL ledger. Before the billing migration is installed it offers an explicitly unissued, unsaved preview. It does not use mock billing data.

## Migration and permissions

Apply 20261116180000_golden_rose_billing.sql only after review and isolated acceptance. It depends on the existing catalogue, retail locations, staff membership and store assignments, POS sales, and customer CRM. The hosted-project check found these prerequisites in project eixbmsethgrtezhdmgsh; the billing RPC and optional employee password-rotation guard were absent. The migration has no data backfill and writes no inventory, CRM, or POS data.

- The private golden_rose_billing schema contains documents, issuer profiles, a business-wide invoice counter, payments, audit events, and request records. RLS is enabled on all tables, no application role has direct table access, and only authenticated sessions can call the public invoker RPC. The private command validates the JWT session, active confirmed staff membership, role and location on every request. It also enforces employee password rotation when that existing guard is deployed.
- Owners can access all stores and are the only role that can verify issuer settings or void unpaid invoices. Managers and accountants work within their active assigned store. The billing CRM lookup exposes active billing contacts only and does not grant CRM management. Owners and accountants can verify another user's offline payment evidence.
- The database uses integer kobo, resolves catalogue prices and CRM details on save, and derives the totals from the store's verified tax rate. Custom non-catalogue lines have separately validated amounts. Updates require the current draft revision. The application never supplies an official number, authoritative tax, or a privileged API key.
- Accepting a quotation records the acceptance reference and freezes the snapshot. Conversion preserves the original and creates at most one linked invoice draft. Issuance uses the Lagos business date, issues GR-INV-1 onward from a row-locked business counter, and retains the immutable snapshot for reprints. Retrying an already issued draft returns the same number. An unpaid invoice can be voided with a reason; a verified payment requires a separately reviewed credit or reversal workflow.
- Payment allocation does not create revenue. A completed same-store POS receipt can be applied once at the recorded net amount after change. An offline payment requires a unique provider-qualified transaction reference and evidence location or details, plus review by a different owner or accountant. Pending or rejected payments do not affect balances. The application does not independently verify a bank statement, store bank credentials, or contact an online payment provider.

## Isolated verification and release

Run the application tests, npm run build, npx tsc --noEmit, and:

    node --test tests/billing-database.mjs tests/billing-print.mjs

The database test uses PGlite (install it in a test environment or set GR_PGLITE_MODULE to an existing copy). It exercises the actual SQL with isolated Auth, store, catalogue, contact and payment fixtures. The print test renders the actual document component from a saved snapshot and checks amounts, dates, issuer details and issued, voided and unissued labels. Set GR_BILLING_PRINT_HTML to an output path to open the generated A4 fixture in a browser. Never use the fixture for a real invoice.

Use a fresh, loopback-only PostgreSQL test cluster with an empty database called gr_billing_fixture for the independent-connection test. Set GR_BILLING_PSQL to the psql executable and GR_BILLING_TEST_PORT to that test cluster's port, then run node --test tests/billing-concurrency.mjs. This applies the migrations to the empty fixture and tests concurrent issuance, retries, and transaction rollback.

Before issuing the first real invoice, approve the SQL, verify the migration history and production prerequisites, and confirm the numbering sequence does not collide with previous official documents. Configure and verify each store's legal billing identity, contact, tax treatment and tax reference. Confirm who can reconcile the store's payment evidence and how they access it. Then verify save → accept → convert → issue → print and payment review with designated staff in a staging environment before enabling official issuance. Credit notes, payment reversal, accounting/revenue reporting and external payment integrations are separate work.
