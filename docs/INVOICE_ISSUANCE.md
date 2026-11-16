# Billing backend for Invoice Studio

The restored Invoice Studio can prepare an editable quotation or invoice draft, look up scoped CRM contacts and catalogue prices, and print an A4 preview. The document remains an unissued draft. Supabase project `eixbmsethgrtezhdmgsh` has recorded POS sales and a private CRM directory, but the read-only acceptance check found no billing tables or issuance RPC. Document storage, numbering and payment balances require the following reviewed changes.

## Database migrations

| Migration | Schema and constraints |
| --- | --- |
| Billing documents and access | Add a private `golden_rose_billing` schema with `documents`, `document_lines` and `events`. Track document kind, state, store, customer link when available, editable billing snapshot, currency, dates, terms, revision and audit actor. Lines store optional variant IDs, labels, SKUs, quantities, unit prices and totals. Persist monetary values as integer minor units. Enable RLS and revoke direct writes. |
| Approval, conversion and issue | Add `document_counters` with a unique issuer, document kind and period. Add unique official references, unique invoice links to source quotations, and an operation idempotency constraint with a request hash. Allocate the official number under a row lock at issue. Snapshot issuer details, customer, variant descriptions, prices, discounts, tax rates and totals at the same time. Require explicit corrections or voids with an audit event after issue. |
| Verified payments | Add `payment_allocations` linked to an issued invoice and an identified, verified payment source. POS cash can use a completed `golden_rose.pos_sales` row after reconciliation. Use `total_minor`, the amount paid after change. Enforce matching store and currency and prevent duplicate or excess allocation with row locks and unique constraints. Other payment sources need their own verified records before they can affect balances. |

## API and permissions

- `list` and `get` return only records in the caller's scope. Use the active staff identity, verified session, current role and assigned retail store. Confirm the billing permissions for owners, managers and accountants before release. Owners can access authorized stores. Other roles need an explicit allowed store. Preserve CRM restrictions for customer lookup.
- `saveDraft` validates the dates, currency, customer or manual recipient and every line on the server. Recompute subtotal, discount, tax and total with integer arithmetic, and require an expected revision when changing a saved draft. Preserve the selected variant ID for provenance. Never trust client totals or a client-supplied price policy.
- `approveQuote` locks the quotation version. `convertQuote` creates a linked invoice draft once and preserves the approved quotation. `issueInvoice` verifies the invoice and tax configuration, snapshots it and allocates the number in one transaction. Drafts have stable internal IDs and no official numbers.
- `allocatePayment` validates payment evidence and allocates the amount idempotently. Compute unpaid, partial and paid states from posted allocations and adjustments. Printing and issuing do not post payment or change inventory.
- Use a user-scoped RPC with server-side permission checks on every call. Pin the search path of any privileged functions, grant only the needed execution privileges, and record actor, store, document, action and revision. Keep source and issued snapshots available to authorized staff for reprints.

## Acceptance before release

Apply the migrations only in an approved isolated environment first. Test duplicate issuance requests, concurrent numbering, previous-revision conflicts, quote conversion retries, cross-store denial, suspended staff, immutable reprints after product edits, and partial and full payments. Use approved business identity and tax configuration for official output. Verify a multi-page A4 PDF from an issued snapshot and check that its payment status agrees with the allocation records. Approve the SQL and migrate production separately.
