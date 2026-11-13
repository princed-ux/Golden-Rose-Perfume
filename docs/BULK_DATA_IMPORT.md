# Golden Rose bulk data import

The owner opens **Business Workspace → Data Management → Import Data**. The workspace uses the existing staff session and module policy. The import API and database RPC independently require an active owner. Files, audit rows, and business data stay in project `eixbmsethgrtezhdmgsh`.

## Supported first stage

| Destination | Example Odoo source | Identity and relationships |
| --- | --- | --- |
| Brands | Custom product brand model | Stable source ID and name. Use the existing `golden_rose.brands` table. |
| Categories | `product.category` | Stable source ID and name. Category hierarchy is a later mapping. |
| Product templates | `product.template` | Stable source ID, name, optional description, brand/category source references, and image reference. New templates start unpublished. |
| Product variants | `product.product` | Stable variant ID and parent template ID. Optional SKU, barcode, size and cost. Selling price and explicit NGN currency are required. Prices are stored as integer kobo. |

A source key represents one source database. Reuse that key across related files and subsequent imports. External IDs and numeric database IDs are separate aliases. For the original Odoo database, the source key `odoo` also looks up the existing numeric Odoo ID columns. An SKU or barcode collision with an unmapped variant is an error for review. Blank optional fields preserve existing values. Export identifiers as text to preserve leading zeros and large IDs. Import brands/categories before templates, and templates before variants.

CSV accepts UTF-8 comma, semicolon and tab separators, including quoted multiline values. XLSX requires one sheet. JSON accepts flat objects in an array or a `records` array. A ZIP can contain multiple supported data files and optional images; select and confirm one dataset per job. Limits are 4 MB per upload, 32 MB expanded ZIP size, 25,000 records and 100 columns per dataset. Split larger exports by record type and keep their source IDs stable.

## Processing and review

1. Inspect and map an export in memory on the server. Validation identifies missing values, conflicting identifiers and catalogue matches. The preview shows up to 50 rows, full counts and a downloadable issue list.
2. Confirm the preview before creating a job. The same file, mapping and source produce a stable fingerprint. The server revalidates and checks whether catalogue matches changed since preview.
3. Store the source in the private `golden-rose-imports` bucket. Save row decisions and payloads in batches of up to 200. Retry interrupted staging with the same file and mapping.
4. Start the staged job explicitly. Each application batch is transactional; row validation failures are reported without rolling back successful unrelated rows. A job can be paused between batches or resumed after a disconnected browser. Completed rows are retained and never replayed. Audit events record the authenticated owner and lifecycle transitions.

Remote migration history includes versions with names or timestamps that differ from local files. The deployed customer-shopping migration is version `20261112173223`; the local copy has a different version. Review the new import migration against the deployed schema in staging and apply **only the reviewed change**. Do not replay the historical migration directory or use a destructive reset.

## Planned mappings

| Business data | Example Odoo source | Destination rule |
| --- | --- | --- |
| Customers, suppliers, addresses | `res.partner` | Preserve source aliases and relationships. Contacts never create Supabase login accounts. |
| Locations and opening stock | `stock.location`, stock snapshot | Match the existing locations and central variant IDs. Initialize via an approved, idempotent opening movement at the agreed cutover. |
| Stock adjustments/history | `stock.move` | Preserve historical movement provenance. Reconcile separately from live balances. |
| Historical sales/orders and lines | `sale.order`, `pos.order` | Import immutable historical documents and line references. Never call the live stock deduction function or count imports as new revenue. |
| Invoices, payments and balances | `account.move`, `account.payment` | Preserve references, dates, amounts, currency, status and provenance. Reconcile outstanding balances without recreating payments. |
| Purchasing and lines | `purchase.order` | Resolve suppliers and product variants. Historical receipts do not recreate stock movements. |

The pipeline separates source adapters, normalized field mappings, validation and the transactional writer. Add a record type only when its destination table, stable key, relationship checks and authoritative write policy are available. `business-data.ts` defines shared read and reconciliation interfaces using the existing catalogue, inventory and domain types. All channels use the same variant and location IDs. Only a newly completed sale invokes the existing atomic inventory transaction.

## Images and optional connectors

Image references are retained in staged payloads. Optional ZIP images remain in the private source package during catalogue import. The separate image attachment stage will resolve an explicit manifest by product source ID or unambiguous SKU; enforce raster type, byte and pixel limits; calculate a content hash; and record upload status and errors per asset. An approved worker can then store verified assets in the product image bucket and register sort order and alt text on `golden_rose.product_images`. Publication remains an explicit authorized action. External image URLs are provenance until a trusted retrieval policy is approved.

A direct source connector is optional. Odoo documents JSON-2 for version 19 and legacy RPC for earlier releases. Verify the instance and access plan before enabling a connector. Use a dedicated read-only account, server-side secrets, bounded pagination, and the same mapping and validation pipeline. [Odoo 19 JSON-2](https://www.odoo.com/documentation/19.0/developer/reference/external_api.html)

## Tests

The parser tests use synthetic CSV, XLSX, JSON and ZIP data, including 20,000 rows. The database integration test runs the new SQL against an isolated PGlite fixture, exercising owner access, private upload policies, idempotency, cancellation, restart and product relationships. Set `GR_PGLITE_MODULE` to a local `@electric-sql/pglite` install and run `node --test tests/import-database.mjs`. PGlite is a test runtime only. Hosted writes and storage remain gated on review and staging acceptance.
