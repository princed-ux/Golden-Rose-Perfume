# Golden Rose Product Management

Owners and managers can create a draft, edit its details and variants, and publish or unpublish it from Products & Catalogue. Creation adds the product and its first variant in one transaction, without stock. Prices are stored as integer kobo. SKU and barcode uniqueness use the existing database indexes. An inactive variant keeps its stock and sales history.

Before the catalogue migration is installed, the workspace uses the existing inventory service for listing, draft creation and publication. The legacy create operation rejects duplicate slugs, SKUs and barcodes. The new catalogue RPC adds request replay and stale-edit protection, product and variant editing, and server-side pagination.

## Release

1. Apply the reviewed migration 20261116180311_golden_rose_catalogue_management.sql to staging. It uses the existing catalogue, staff and session tables. It creates a private mutation log and a user-scoped RPC. It does not change existing product rows, stock balances, or Edge Functions when applied.
2. Verify the draft, edit, publish, stock receipt and POS flow in staging before applying the reviewed catalogue migration to Golden Rose. The catalogue migration does not require the billing migration. Review migration history and release each pending migration separately.
3. The hosted inventory-admin version predates the employee-session check in the repository source. The product release uses the deployed version for the legacy operations and the new RPC for editing. Keep the deployed Edge Function version until the employee-account migration provides gr_employee_session_allowed and the coordinated staff release has been tested. The catalogue RPC checks that guard when installed and checks active, confirmed staff identity and their session in either case.

## Product images

The hosted catalogue has the approved raster image bucket but had no linked product photos at the time of review. The storefront uses existing linked image records when available. Upload remains a separate release because the bucket is public and the workspace has no authorized upload and attachment flow. It needs file validation, an owner/manager check, a verified product association, and cleanup after failed uploads. No temporary images or tools were attached to the imported products.

## Tests

Run node --test tests/product-management-database.mjs against an isolated environment with PGlite available. The test covers draft visibility, validation, retries, permissions, variant edits, publication, the public catalogue, receiving, barcode lookup, an atomic sale, and sales history. It does not connect to hosted Supabase.
