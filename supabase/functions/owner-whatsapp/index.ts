import { withSupabase } from "npm:@supabase/server@1.9.2";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(["create", "edit", "set_primary", "enable", "disable", "delete"]);
const PURPOSES = new Set(["orders", "support", "branch"]);

const respond = (data: unknown, status = 200): Response =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

const problem = (message: string, status = 400) =>
  respond({ ok: false, error: message }, status);

function errorResponse(code: string): Response {
  if (code === "42501") return problem("Active owner permissions required", 403);
  if (code === "23505") return problem("This WhatsApp number is already registered", 409);
  if (code === "22023" || code === "23514") return problem("Invalid WhatsApp contact details", 400);
  if (code === "P0002") return problem("Contact not found", 404);
  return problem("Unable to update WhatsApp settings", 500);
}

export default {
  fetch: withSupabase({ auth: "user" }, async (request, context) => {
    const actorId = context.userClaims?.id ?? context.jwtClaims?.sub;
    if (typeof actorId !== "string" || !UUID.test(actorId)) {
      return problem("Invalid user session", 401);
    }

    if (request.method === "GET") {
      const { data, error } = await context.supabaseAdmin.rpc(
        "gr_owner_whatsapp_contacts", { p_actor_id: actorId }
      );
      if (error) {
        if (error.code !== "42501") console.error("owner-whatsapp GET", error.code);
        return errorResponse(error.code);
      }
      return respond({ ok: true, numbers: Array.isArray(data?.numbers) ? data.numbers : [] });
    }

    if (request.method !== "POST") return problem("Method not allowed", 405);
    if (Number(request.headers.get("content-length") ?? 0) > 8192) {
      return problem("Request too large", 413);
    }

    let body: Record<string, unknown>;
    try {
      const received: unknown = await request.json();
      if (!received || typeof received !== "object" || Array.isArray(received)) {
        return problem("Expected a JSON object");
      }
      body = received as Record<string, unknown>;
    } catch { return problem("Invalid JSON"); }

    const action = body.action;
    if (typeof action !== "string" || !ACTIONS.has(action)) {
      return problem("Unknown WhatsApp action");
    }

    const contactId = body.id;
    if (contactId != null && (typeof contactId !== "string" || !UUID.test(contactId))) {
      return problem("Invalid contact ID");
    }
    if (action !== "create" && typeof contactId !== "string") {
      return problem("Contact ID is required");
    }

    const label = body.label;
    if (label != null && (typeof label !== "string" || label.trim().length < 2 || label.trim().length > 80)) {
      return problem("Label must be 2–80 characters");
    }
    if (action === "create" && typeof label !== "string") {
      return problem("Label is required");
    }

    const purpose = body.purpose;
    if (purpose != null && (typeof purpose !== "string" || !PURPOSES.has(purpose))) {
      return problem("Invalid purpose");
    }

    const rawPhone = body.number;
    let phone: string | null = null;
    if (rawPhone != null) {
      if (typeof rawPhone !== "string" || !/^\+?[0-9 ()-]{8,30}$/.test(rawPhone)) {
        return problem("Enter a number with international country code");
      }
      phone = rawPhone.replace(/[^0-9]/g, "");
      if (!/^[1-9][0-9]{7,14}$/.test(phone)) {
        return problem("Enter a valid international number");
      }
    }
    if (action === "create" && phone === null) {
      return problem("WhatsApp number is required");
    }

    const { data, error } = await context.supabaseAdmin.rpc(
      "gr_owner_manage_whatsapp",
      {
        p_actor_id: actorId,
        p_action: action,
        p_id: typeof contactId === "string" ? contactId : null,
        p_label: typeof label === "string" ? label.trim() : null,
        p_phone_digits: phone,
        p_purpose: typeof purpose === "string" ? purpose : null,
      },
    );
    if (error) {
      if (!["42501", "23505", "22023", "23514", "P0002"].includes(error.code)) {
        console.error("owner-whatsapp POST", error.code);
      }
      return errorResponse(error.code);
    }

    return respond({ ok: true, ...data });
  }),
};