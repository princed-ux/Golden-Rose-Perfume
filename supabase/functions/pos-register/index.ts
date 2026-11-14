import { withSupabase } from "npm:@supabase/server@1.9.2";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const respond = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

function problem(error: unknown): Response {
  const issue = error as { code?: string; message?: string };
  if (issue.code === "42501") return respond({ ok: false, error: "Your active staff role does not permit this POS operation." }, 403);
  if (issue.code === "23514") return respond({ ok: false, error: "Insufficient available stock. Refresh the register and check quantities." }, 409);
  if (issue.code === "22023" || issue.code === "22P02") return respond({ ok: false, error: issue.message ?? "Invalid register request." }, 400);
  if (issue.code === "P0002") return respond({ ok: false, error: "Receipt was not found." }, 404);
  console.error("POS register RPC failed", { code: issue.code ?? "unknown" });
  return respond({ ok: false, error: "The register could not complete the request. Retry using the same transaction." }, 503);
}

export default {
  fetch: withSupabase({ auth: "user" }, async (request, context) => {
    const actor = context.userClaims?.id ?? context.jwtClaims?.sub;
    if (typeof actor !== "string" || !uuid.test(actor)) return respond({ ok: false, error: "Invalid staff session" }, 401);

    if (request.method === "GET") {
      const url = new URL(request.url);
      const view = url.searchParams.get("view");
      const isReceipt = view === "receipt";
      if (view && !isReceipt) return respond({ ok: false, error: "Unknown register view" }, 400);
      const saleId = url.searchParams.get("saleId");
      if (isReceipt && (!saleId || !uuid.test(saleId))) return respond({ ok: false, error: "Invalid sale ID" }, 400);
      const offset = Number(url.searchParams.get("offset") ?? "0");
      const limit = Number(url.searchParams.get("limit") ?? "40");
      if (!isReceipt && (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000 ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 80)) {
        return respond({ ok: false, error: "Invalid catalogue page" }, 400);
      }
      const locationId = url.searchParams.get("locationId");
      if (!isReceipt && locationId && !uuid.test(locationId)) return respond({ ok: false, error: "Invalid store location" }, 400);
      const payload = isReceipt ? { saleId } : {
        search: (url.searchParams.get("search") ?? "").slice(0,100), locationId,
        offset, limit
      };
      const { data, error } = await context.supabaseAdmin.rpc("gr_pos_register", {
        p_actor_id: actor, p_action: isReceipt ? "receipt" : "catalog", p_payload: payload,
      });
      if (error) return problem(error);
      return respond(data);
    }

    if (request.method !== "POST") return respond({ ok: false, error: "Method not allowed" }, 405);
    if (Number(request.headers.get("content-length") ?? "0") > 8192) {
      return respond({ ok: false, error: "Sale request too large" }, 413);
    }
    let body: Record<string, unknown>;
    try {
      const value: unknown = await request.json();
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
      body = value as Record<string, unknown>;
    } catch {
      return respond({ ok: false, error: "Invalid sale payload" }, 400);
    }
    if (body.action !== "checkout" || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 40
      || typeof body.idempotencyKey !== "string" || !uuid.test(body.idempotencyKey)) {
      return respond({ ok: false, error: "Invalid checkout request" }, 400);
    }
    const { data, error } = await context.supabaseAdmin.rpc("gr_pos_checked_checkout", {
      p_actor_id: actor, p_payload: body,
    });
    if (error) return problem(error);
    return respond(data);
  }),
};