# Golden Rose migration history alignment — 2026-11-17

The hosted Golden Rose Supabase project `eixbmsethgrtezhdmgsh` had historical migrations with timestamps that did not match the repository. This commit synchronizes the repository's `supabase/migrations` directory with the **existing applied versions**. SQL for historical versions was recovered from `supabase_migrations.schema_migrations.statements`; the hosted database was not reset or migration-repaired.

Earlier local files equivalent to already-applied migrations:
- `20261112163007_customer_shopping_and_catalogue_photos.sql` → `20261112173223_golden_rose_customer_shopping_and_catalogue_photos.sql` (same SQL ignoring formatting and comments)
- `20261112200714_bulk_data_import_foundation.sql` → `20261113190032_golden_rose_bulk_data_import_foundation.sql`
- `20261113182003_golden_rose_owner_access.sql` → `20261113185953_golden_rose_owner_access.sql`

Migrations applied via Supabase management API on 2026-11-17:
- `20261117164012_owner_created_employee_accounts.sql`
- `20261117164015_golden_rose_billing.sql`
- `20261117164018_golden_rose_catalogue_management.sql`

Previous draft filenames (`20261115170000`, `20261116180000`, `20261116180311`) were replaced by the actual applied versions.

The older `20260401140431` historical marker intentionally remains a no-op because it belongs to the reused project's retired KolexTrader setup.

The `docs/sql/stock-count-visibility.sql` file remains **a proposal only**. It is not an applied migration or an opening-stock workflow.

Before future production deployments: run `supabase migration list`, review the SQL and staged differences, and avoid replaying applied historical migrations. The user-facing Next.js server still requires staff administration secrets and Supabase Auth email-confirmation policy checks.
