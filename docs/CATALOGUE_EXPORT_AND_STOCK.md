# Catalogue export and opening stock

Export catalogue downloads CSV or JSON from the Products workspace. It applies the current search and publication filters across all catalogue pages. A product with zero variants is included on its own row with blank variant fields. Each matching product with variants exports all of those variants.

CSV keeps SKU and barcode digits intact and protects formula-like text. Import the SKU and barcode columns as Text in a spreadsheet to prevent automatic number conversion. JSON preserves field types and original text. The deployed inventory-admin response does not supply product or variant timestamps, so those columns are empty until the read endpoint exposes them. The SQL proposal adds timestamps without modifying the records.

## Findings on November 17, 2026

A read-only inspection of the Golden Rose Supabase project found 1,000 imported product templates and 1,000 imported variants. The active retail location had zero balance rows. There were zero opening movements, receiving movements, or other stock movements. All 1,000 variants belong to unpublished products.

The importer records catalogue templates and variants, and creates no opening quantities. The inventory read function pairs variants with locations and returns zero when a balance is absent. A field showing zero therefore cannot prove that a physical count occurred. Also, stock movements require a nonzero delta, so a confirmed opening quantity of zero cannot be represented as a movement. A balance that reaches zero after sales is not evidence of a physical count.

## Proposed migration

Review stock-count-visibility.sql outside the migration runner. It adds a private physical count observation table and two backwards-compatible read changes. It creates no observed quantities and leaves receiving, POS and publication logic intact.

- No balance and no physical observation means **Not counted**. With the existing API, the dashboard labels a zero without this evidence **Count unverified**.
- A latest verified physical count of zero, a zero or absent balance, and no later balance change or movement mean **Verified zero**.
- Recorded positive availability means **Available**, even if an opening count was never entered. Fully reserved units have their own status.

Before release, review the proposal against the deployed function definitions and test location scopes in staging. A separate owner-approved count workflow can record the physical observation and reconcile it against the existing movement ledger. For positive or changed quantities, a reviewed transaction must write the appropriate movement, with an idempotency key and an expected balance or ledger version. A zero observation must be recorded explicitly without inventing a movement. Do not infer observations from catalogues, zero-valued balances, or sample data.
