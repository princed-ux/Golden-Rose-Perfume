import { withSupabase } from "npm:@supabase/server@1.9.2";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const jsonHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store" };

function reply(body: unknown, status=200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}
function bad(error: string, status=400): Response { return reply({ ok: false, error }, status); }
function txt(value: unknown, max=200): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max
    ? value.trim() : null;
}
function optional(value: unknown, max=200): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  return typeof value === "string" && value.length <= max ? value.trim() : undefined;
}
function positivePaging(value: string | null, defaultVal: number, max: number) {
  if (value === null) return defaultVal;
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n <= max ? n : null;
}

const inventoryAdmin = {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const actorId = ctx.userClaims?.id ?? ctx.jwtClaims?.sub;
    if (typeof actorId !== "string" || !UUID.test(actorId)) return bad("Invalid user session",401);
    const sessionId = ctx.jwtClaims?.session_id;
    if (typeof sessionId !== "string" || !UUID.test(sessionId)) return bad("Invalid user session", 401);
    const credential = await ctx.supabaseAdmin.rpc("gr_employee_session_allowed", {
      p_actor: actorId, p_session: sessionId,
    });
    if (credential.error) {
      console.error("inventory-admin credential check failed", credential.error.code);
      return bad("Unable to verify employee session", 503);
    }
    if (credential.data !== true) return bad("Sign in again to access inventory", 403);

    if (req.method === "GET") {
      const url = new URL(req.url);
      const view = url.searchParams.get("view") ?? "products";
      if (view !== "products" && view !== "inventory") return bad("Unknown view");
      const limit = positivePaging(url.searchParams.get("limit"),50,100);
      const offset = positivePaging(url.searchParams.get("offset"),0,1000000);
      if (limit === null || offset === null || limit < 1) return bad("Invalid pagination");
      const rpc = view === "inventory" ? "gr_inventory_snapshot" : "gr_admin_products";
      const { data, error } = await ctx.supabaseAdmin.rpc(rpc, {
        p_actor_id: actorId, p_limit: limit, p_offset: offset,
      });
      if (error) {
        if (error.code === "42501") return bad("Active staff account required",403);
        console.error("inventory-admin read error", error.code);
        return bad("Unable to load business data",500);
      }
      return reply({ ok:true, ...data });
    }

    if (req.method !== "POST") return bad("Method not allowed",405);
    if (Number(req.headers.get("content-length") ?? "0") > 16384) return bad("Request too large",413);

    let body: Record<string, unknown>;
    try {
      const value: unknown = await req.json();
      if (!value || typeof value !== "object" || Array.isArray(value)) return bad("Expected JSON object");
      body = value as Record<string, unknown>;
    } catch { return bad("Invalid JSON"); }

    const action = body.action;
    let rpc: string;
    let params: Record<string, unknown>;

    if (action === "product.create") {
      const name = txt(body.name,200);
      const slug = txt(body.slug,240);
      const sku = txt(body.sku,80);
      const priceMinor = body.priceMinor;
      if (!name || !slug || !sku || !Number.isSafeInteger(priceMinor) || (priceMinor as number)<0) {
        return bad("name, slug, sku and nonnegative integer priceMinor are required");
      }
      const brandName = optional(body.brandName,150);
      const categoryName = optional(body.categoryName,150);
      const barcode = optional(body.barcode,128);
      const description = optional(body.description,5000);
      const sizeMl = body.sizeMl === undefined || body.sizeMl === null ? null : body.sizeMl;
      if (brandName === undefined || categoryName === undefined || barcode === undefined || description === undefined ||
          (sizeMl !== null && (typeof sizeMl !== "number" || !Number.isFinite(sizeMl) || sizeMl <= 0))) {
        return bad("Invalid product field");
      }
      const currency = body.currency === undefined ? "NGN" : txt(body.currency,3);
      if (currency !== "NGN") return bad("Only NGN prices are enabled");
      rpc = "gr_create_product";
      params = { p_actor_id:actorId, p_name:name,p_slug:slug,p_sku:sku,
        p_price_minor:priceMinor,p_brand_name:brandName,p_category_name:categoryName,
        p_barcode:barcode,p_size_ml:sizeMl,p_description:description,p_currency:currency };
    } else if (action === "location.create") {
      const name = txt(body.name,150);
      const code = txt(body.code,32);
      const type = body.type === undefined ? "store" : body.type;
      if (!name || !code || !["store","stockroom","warehouse"].includes(type as string)) {
        return bad("Valid location name, code and type required");
      }
      rpc = "gr_create_location";
      params = { p_actor_id:actorId, p_name:name, p_code:code, p_location_type:type };
    } else if (action === "product.publish") {
      if (typeof body.productId !== "string" || !UUID.test(body.productId) ||
          typeof body.published !== "boolean") {
        return bad("Valid productId and published boolean required");
      }
      rpc="gr_set_product_publication";
      params={p_actor_id:actorId,p_product_id:body.productId,p_publish:body.published};
    } else {
      return bad("Unknown action");
    }

    const { data, error } = await ctx.supabaseAdmin.rpc(rpc,params);
    if (error) {
      if (error.code === "42501") return bad("Owner or manager permissions required",403);
      if (error.code === "23505") return bad("Product slug, SKU, barcode, or location code already exists",409);
      if (error.code === "23503" || error.code === "P0002") return bad("Referenced record not found",404);
      if (error.code === "22023" || error.code === "23514") return bad("Invalid business data",400);
      console.error("inventory-admin write error",rpc,error.code);
      return bad("Unable to save business data",500);
    }
    return reply({ok:true,data},201);
  }),
};

export default inventoryAdmin;
