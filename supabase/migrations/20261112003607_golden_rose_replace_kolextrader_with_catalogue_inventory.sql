
-- Golden Rose Platform — clean legacy application and install inventory foundation.
-- Target: project eixbmsethgrtezhdmgsh. Preserves Supabase system schemas and auth.users.
BEGIN;

-- Legacy KolexTrader signup trigger routes newly created accounts to public.profiles.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Delete the eight verified legacy application tables, including one old profile.
-- All eight tables are named explicitly; do not drop the public schema.
DROP TABLE IF EXISTS
    public.notifications,
    public.activity_logs,
    public.ai_signals,
    public.market_data,
    public.trades,
    public.strategies,
    public.portfolios,
    public.profiles;

DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.update_updated_at_column();

-- A private schema for Golden Rose's business-critical data.
CREATE SCHEMA golden_rose;
REVOKE ALL ON SCHEMA golden_rose FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA golden_rose TO service_role;

CREATE TABLE golden_rose.brands (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (length(btrim(name)) > 0),
    slug text NOT NULL UNIQUE CHECK (length(btrim(slug)) > 0),
    description text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE golden_rose.categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (length(btrim(name)) > 0),
    slug text NOT NULL UNIQUE,
    parent_id uuid REFERENCES golden_rose.categories(id) ON DELETE RESTRICT,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT category_no_self_parent CHECK (parent_id IS DISTINCT FROM id)
);

CREATE TABLE golden_rose.products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (length(btrim(name)) > 0),
    slug text NOT NULL UNIQUE,
    brand_id uuid REFERENCES golden_rose.brands(id) ON DELETE RESTRICT,
    category_id uuid REFERENCES golden_rose.categories(id) ON DELETE RESTRICT,
    description text,
    odoo_template_id bigint UNIQUE,
    is_active boolean NOT NULL DEFAULT true,
    is_published boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_brand_idx ON golden_rose.products(brand_id);
CREATE INDEX products_category_idx ON golden_rose.products(category_id);

CREATE TABLE golden_rose.product_variants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES golden_rose.products(id) ON DELETE RESTRICT,
    name text,
    sku text CHECK (sku IS NULL OR length(btrim(sku)) > 0),
    barcode text CHECK (barcode IS NULL OR length(btrim(barcode)) > 0),
    size_ml numeric(10,2) CHECK (size_ml IS NULL OR size_ml > 0),
    concentration text,
    price_minor bigint NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
    cost_minor bigint CHECK (cost_minor IS NULL OR cost_minor >= 0),
    currency text NOT NULL DEFAULT 'NGN' CHECK (currency ~ '^[A-Z]{3}$'),
    odoo_variant_id bigint UNIQUE,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX variants_sku_unique ON golden_rose.product_variants (lower(sku)) WHERE sku IS NOT NULL;
CREATE UNIQUE INDEX variants_barcode_unique ON golden_rose.product_variants (barcode) WHERE barcode IS NOT NULL;
CREATE INDEX variants_product_idx ON golden_rose.product_variants(product_id);

CREATE TABLE golden_rose.product_images (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES golden_rose.products(id) ON DELETE RESTRICT,
    storage_path text NOT NULL CHECK (length(btrim(storage_path)) > 0),
    alt_text text,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_images_product_idx ON golden_rose.product_images(product_id,sort_order);

CREATE TABLE golden_rose.locations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (length(btrim(name)) > 0),
    code text NOT NULL UNIQUE CHECK (length(btrim(code)) > 0),
    location_type text NOT NULL DEFAULT 'store' CHECK (location_type IN ('store','stockroom','warehouse')),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE golden_rose.stock_balances (
    variant_id uuid NOT NULL REFERENCES golden_rose.product_variants(id) ON DELETE RESTRICT,
    location_id uuid NOT NULL REFERENCES golden_rose.locations(id) ON DELETE RESTRICT,
    on_hand integer NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
    reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= on_hand),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (variant_id,location_id)
);
CREATE INDEX stock_balances_location_idx ON golden_rose.stock_balances(location_id);

CREATE TABLE golden_rose.stock_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id uuid NOT NULL,
    location_id uuid NOT NULL,
    movement_type text NOT NULL CHECK (movement_type IN ('opening','receiving','sale','return','adjustment','transfer_in','transfer_out')),
    quantity_delta integer NOT NULL CHECK (quantity_delta <> 0),
    balance_after integer NOT NULL CHECK (balance_after >= 0),
    reference_type text,
    reference_id text,
    idempotency_key text NOT NULL UNIQUE CHECK (length(btrim(idempotency_key)) > 0),
    performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY(variant_id,location_id) REFERENCES golden_rose.stock_balances(variant_id,location_id) ON DELETE RESTRICT
);
CREATE INDEX stock_movements_history_idx ON golden_rose.stock_movements(variant_id,location_id,created_at DESC);
CREATE INDEX stock_movements_reference_idx ON golden_rose.stock_movements(reference_type,reference_id);

-- Inventory history is immutable. Corrections must be new compensating movements.
CREATE FUNCTION golden_rose.block_movement_rewrite()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Stock movements are append-only; create a correcting movement instead';
END;
$$;
CREATE TRIGGER prevent_stock_movement_rewrite
BEFORE UPDATE OR DELETE ON golden_rose.stock_movements
FOR EACH ROW EXECUTE FUNCTION golden_rose.block_movement_rewrite();

-- Defense in depth: no anon or authenticated direct table operations yet.
ALTER TABLE golden_rose.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE golden_rose.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE golden_rose.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE golden_rose.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE golden_rose.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE golden_rose.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE golden_rose.stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE golden_rose.stock_movements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA golden_rose FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA golden_rose TO service_role;
REVOKE ALL ON FUNCTION golden_rose.block_movement_rewrite() FROM PUBLIC, anon, authenticated;

COMMIT;
