import { withSupabase } from "npm:@supabase/server@1.9.2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
};

function respond(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { ...cors, "Cache-Control": "no-store" },
  });
}

export default {
  fetch: withSupabase({ auth: "none" }, async (request, context) => {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== "GET") {
      return respond({ ok: false, error: "Method not allowed" }, 405);
    }

    const { data, error } = await context.supabaseAdmin.rpc(
      "gr_public_whatsapp_contacts",
    );

    if (error) {
      console.error("store-contacts read error", error.code);
      return respond({ ok: false, error: "Contact settings unavailable" }, 503);
    }

    return respond({
      ok: true,
      primaryId: data?.primaryId ?? null,
      numbers: Array.isArray(data?.numbers) ? data.numbers : [],
    });
  }),
};