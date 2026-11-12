import { withSupabase } from "npm:@supabase/server@1.9.2";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const keyPattern = /^[A-Za-z0-9:_-]{8,128}$/;

function reject(message: string, status: number) {
  return Response.json({ ok: false, error: message }, { status });
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return reject("Method not allowed", 405);

    const length = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > 16384) {
      return reject("Request too large", 413);
    }

    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await req.json();
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
        return reject("Expected a JSON object", 400);
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return reject("Invalid JSON", 400);
    }

    const actorId = ctx.userClaims?.id ?? ctx.jwtClaims?.sub;
    if (typeof actorId !== "string" || !uuid.test(actorId)) {
      return reject("Invalid user session", 401);
    }

    const variantId = body.variantId;
    const locationId = body.locationId;
    const quantity = body.quantity;
    const idempotencyKey = body.idempotencyKey;
    const referenceId = body.referenceId;
    const notes = body.notes;

    if (typeof variantId !== "string" || !uuid.test(variantId) ||
        typeof locationId !== "string" || !uuid.test(locationId)) {
      return reject("A valid variantId and locationId are required", 400);
    }
    if (typeof quantity !== "number" || !Number.isInteger(quantity) ||
        quantity < 1 || quantity > 1000000) {
      return reject("Quantity must be a whole number between 1 and 1000000", 400);
    }
    if (typeof idempotencyKey !== "string" || !keyPattern.test(idempotencyKey)) {
      return reject("idempotencyKey must be 8-128 letters, numbers, colons, underscores or hyphens", 400);
    }
    if (referenceId != null && (typeof referenceId !== "string" || referenceId.length > 128)) {
      return reject("referenceId is invalid", 400);
    }
    if (notes != null && (typeof notes !== "string" || notes.length > 500)) {
      return reject("notes is invalid", 400);
    }

    // Trusted server-only client. The database independently verifies active
    // owner/manager/inventory_staff membership before modifying inventory.
    const { data, error } = await ctx.supabaseAdmin.rpc("gr_receive_stock", {
      p_actor_id: actorId,
      p_variant_id: variantId,
      p_location_id: locationId,
      p_quantity: quantity,
      p_idempotency_key: idempotencyKey,
      p_reference_type: "receiving",
      p_reference_id: referenceId ?? null,
      p_notes: notes ?? null,
    });

    if (error) {
      if (error.code === "42501") return reject("Staff role does not permit receiving stock", 403);
      if (error.code === "22023") return reject("Invalid or conflicting stock receipt", 409);
      if (error.code === "23503") return reject("Variant or location does not exist", 404);
      console.error("inventory-receive failed", error.code);
      return reject("Unable to receive stock", 500);
    }

    return Response.json({ ok: true, movementId: data }, { status: 200 });
  }),
};
