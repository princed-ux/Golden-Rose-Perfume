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

CSV accepts UTF-8 comma, semicolon and tab separators, including quoted multiline values. XLSX requires one sheet. JSON accepts flat objects in an array or a `records` array. A ZIP can contain up to 12 data files and optional images. Limits are 4 MB per upload, 32 MB expanded ZIP size, 25,000 records per import and 100 columns per dataset. Split larger exports by record type and keep their source IDs stable.

## Processing and review

1. **Upload file.** Selecting an export starts inspection and catalogue validation. Recognized columns are mapped automatically. A flat product spreadsheet with a name, price and SKU or barcode can supply templates, variants and related names. Prefer explicit source IDs for records whose names can change. Review the inferred source key and override mappings in Advanced Options.
2. **Review products.** Review the package totals and download row issues. The server validates dependencies within the package and checks existing catalogue ownership of identifiers. It saves one verified copy of the source in private Storage and binds approval to the file digest, mapping and catalogue decisions. Identical repeats reopen the same approved package for that source key.
3. **Import.** One confirmation saves the approved package. The importer runs brands, categories, templates and variants in order through separate audited database jobs. The next dataset starts after the previous one finishes without errors. PostgreSQL revalidates before applying an atomic batch of up to 200 rows. A failed dataset stops the package and leaves already committed batches visible. Import history restores saved progress, and Resume continues from the current job without re-uploading the source.

The Golden Rose project already has the bulk-import RPC and private bucket. Configure `SUPABASE_IMPORT_SECRET_KEY` for the Next.js server and restart it to enable cloud history, catalogue matching and staging. History returns an empty list only after a successful owner-authorized query.

## Scaling beyond the current upload limit

The request parser and storage bucket currently cap source files at 4,000,000 bytes. To support 100,000+ records, issue short-lived, object-scoped upload tokens after verifying the owner, and upload directly to private Storage using TUS. A worker should verify the stored object's digest, stream the source into bounded validation batches, and persist checkpoints and row issues. It should resume from the last committed checkpoint and reuse the existing source IDs, fingerprint checks and transactional write batches. Larger bucket limits and worker support require an isolated load test before release.

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
