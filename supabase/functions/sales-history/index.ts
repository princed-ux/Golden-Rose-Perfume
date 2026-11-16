import { withSupabase } from "npm:@supabase/server@1.9.2";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day = /^\d{4}-\d{2}-\d{2}$/;
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

function failure(error: unknown) {
  const issue = error as { code?: string; message?: string };
  if (issue.code === "GR403" || issue.code === "42501") {
    return json({ ok: false, error: "You do not have access to these sales." }, 403);
  }
  if (issue.code === "22023" || issue.code === "22P02" || issue.code === "22007") {
    return json({ ok: false, error: issue.message?.slice(0, 180) ?? "Invalid sales request." }, 400);
  }
  if (issue.code === "P0002") return json({ ok: false, error: "Receipt not found." }, 404);
  console.error("Sales-history RPC failed", { code: issue.code ?? "unknown" });
  return json({ ok: false, error: "Sales history is temporarily unavailable." }, 503);
}

export default {
  fetch: withSupabase({ auth: "user" }, async (request, context) => {
    if (request.method !== "GET") {
      return json({ ok: false, error: "Method not allowed." }, 405);
    }
    const actor = context.userClaims?.id ?? context.jwtClaims?.sub;
    const session = context.jwtClaims?.session_id;
    if (typeof actor !== "string" || !uuid.test(actor) ||
        typeof session !== "string" || !uuid.test(session)) {
      return json({ ok: false, error: "Sign in to view sales." }, 401);
    }

    const url = new URL(request.url);
    const view = url.searchParams.get("view") ?? "list";
    const payload: Record<string, string> = {};
    if (view === "receipt") {
      const saleId = url.searchParams.get("saleId");
      if (!saleId || !uuid.test(saleId)) {
        return json({ ok: false, error: "Invalid receipt reference." }, 400);
      }
      payload.saleId = saleId;
    } else if (view === "list") {
      const offset = url.searchParams.get("offset") ?? "0";
      const limit = url.searchParams.get("limit") ?? "30";
      const search = (url.searchParams.get("search") ?? "").trim();
      const from = url.searchParams.get("from") ?? "";
      const to = url.searchParams.get("to") ?? "";
      const locationId = url.searchParams.get("locationId") ?? "";
      if (!/^\d{1,5}$/.test(offset) || Number(offset) > 10000 ||
          !/^\d{1,2}$/.test(limit) || Number(limit) < 1 || Number(limit) > 50 ||
          search.length > 100 || (from && !day.test(from)) ||
          (to && !day.test(to)) || (locationId && !uuid.test(locationId))) {
        return json({ ok: false, error: "Invalid sales filters." }, 400);
      }
      Object.assign(payload, { offset, limit, search, from, to, locationId });
    } else {
      return json({ ok: false, error: "Unknown sales view." }, 400);
    }

    const { data, error } = await context.supabaseAdmin.rpc("gr_sales_history", {
      p_actor: actor,
      p_session: session,
      p_action: view,
      p_payload: payload,
    });
    if (error) return failure(error);
    return json(data);
  }),
};
