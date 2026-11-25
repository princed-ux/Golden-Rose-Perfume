import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import { ROLES } from "../../../src/domain/types";

import {
  validSalePayment,
  receiptPaymentMatches,
  isPaymentMethod,
  validReceivingAccount,
} from "../../../src/lib/golden-rose/pos-payments";

import {
  canViewModule,
  validSaleRequest,
  UUID,
  type CashSaleRequest,
  type PosCatalogue,
  type PosProduct,
  type PosReceipt,
  type Role,
} from "./domain";

import type { DesktopConfig } from "./config";

export type StaffIdentity = {
  id: string;
  email: string;
  name: string;
  role: Exclude<Role, "customer">;
};

export type Access =
  | { kind: "staff"; staff: StaffIdentity }
  | { kind: "enrollment"; email: string };

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status = 0,
  ) {
    super(message);
  }

  get rejected() {
    return [400, 401, 403, 404, 409, 422].includes(
      this.status,
    );
  }
}

function validProduct(
  value: PosProduct,
): boolean {
  return (
    UUID.test(value.id) &&
    UUID.test(value.productId) &&
    typeof value.name === "string" &&
    Number.isSafeInteger(value.priceMinor) &&
    value.priceMinor >= 0 &&
    value.currency === "NGN" &&
    Number.isSafeInteger(value.available) &&
    value.available >= 0
  );
}

export function validateReceipt(
  receipt: PosReceipt,
): boolean {
  return Boolean(
    receipt &&
      UUID.test(receipt.saleId) &&
      Array.isArray(receipt.items) &&
      receipt.items.length > 0 &&
      UUID.test(receipt.locationId) &&
      isPaymentMethod(receipt.method) &&
      validSalePayment(
        receipt,
        receipt.totalMinor,
      ) &&
      receipt.currency === "NGN" &&

      [
        receipt.subtotalMinor,
        receipt.discountMinor,
        receipt.taxMinor,
        receipt.totalMinor,
        receipt.tenderedMinor,
        receipt.changeMinor,
      ].every(
        amount =>
          Number.isSafeInteger(amount) &&
          amount >= 0,
      ) &&

      receipt.totalMinor ===
        receipt.subtotalMinor -
          receipt.discountMinor +
          receipt.taxMinor &&

      receipt.changeMinor ===
        receipt.tenderedMinor -
          receipt.totalMinor &&

      receipt.items.every(
        line =>
          UUID.test(line.variantId) &&
          typeof line.name === "string" &&
          Number.isInteger(line.quantity) &&
          line.quantity > 0 &&
          Number.isSafeInteger(line.unitPriceMinor) &&
          line.unitPriceMinor > 0 &&
          line.lineTotalMinor ===
            line.quantity * line.unitPriceMinor,
      ),
  );
}

export class DesktopApi {
  constructor(
    public readonly auth: SupabaseClient,
    public readonly config: DesktopConfig,
    private readonly fetcher: typeof fetch =
      globalThis.fetch.bind(globalThis),
  ) {}

  async edge<T>(
    endpoint: string,
    params?: URLSearchParams,
    body?: unknown,
  ): Promise<T> {
    const {
      data: { session },
    } = await this.auth.auth.getSession();

    if (!session) {
      throw new ApiError(
        "Sign in with your work account.",
        401,
      );
    }

    const url = new URL(
      "/functions/v1/" + endpoint,
      this.config.url,
    );

    if (params) {
      url.search = params.toString();
    }

    let response: Response;

    try {
      response = await this.fetcher(url, {
        method: body ? "POST" : "GET",

        headers: {
          apikey: this.config.publishableKey,
          authorization:
            "Bearer " + session.access_token,
          "content-type": "application/json",
        },

        body: body
          ? JSON.stringify(body)
          : undefined,

        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
        redirect: "error",
      });
    } catch {
      throw new ApiError(
        body
          ? "Confirmation unavailable. Retry the same transaction reference."
          : "Unable to reach Golden Rose. Check your connection and retry.",
      );
    }

    const data = await response.json().catch(
      () => null,
    );

    if (!response.ok || !data || data.ok === false) {
      const fallback =
        response.status === 401
          ? "Your session expired. Sign in again."
          : response.status === 403
            ? "Your active staff account cannot perform this operation."
            : "Golden Rose could not confirm this request. Retry using the same reference.";

      throw new ApiError(
        typeof data?.error === "string"
          ? data.error.slice(0, 220)
          : fallback,
        response.status,
      );
    }

    return data as T;
  }

  async verify(): Promise<Access> {
    const {
      data: { user },
      error,
    } = await this.auth.auth.getUser();

    if (error || !user) {
      throw new ApiError(
        "Your session could not be verified. Sign in again.",
        401,
      );
    }

    if (!user.email_confirmed_at || user.is_anonymous) {
      throw new ApiError(
        "Confirm your work email before signing in.",
        403,
      );
    }

    const state = await this.auth.rpc(
      "gr_employee_password_state",
    );

    // Fail closed if credential enrollment
    // is missing or unavailable.

    if (state.error) {
      throw new ApiError(
        "Employee password status could not be checked. Ask the owner to verify the staff release.",
      );
    }

    if (state.data === "change_required") {
      return {
        kind: "enrollment",
        email: user.email ?? "",
      };
    }

    if (state.data !== "none") {
      throw new ApiError(
        state.data === "expired"
          ? "Your temporary password expired. Ask the owner for a replacement."
          : "Staff access is unavailable or suspended.",
        403,
      );
    }

    const staff = await this.edge<{
      isStaff: boolean;
      role: string;
    }>("staff-session");

    if (
      !staff.isStaff ||
      staff.role === "customer" ||
      !ROLES.includes(staff.role as Role)
    ) {
      throw new ApiError(
        "An active staff membership is required.",
        403,
      );
    }

    return {
      kind: "staff",
      staff: {
        id: user.id,
        email: user.email ?? "",
        name: String(
          user.user_metadata?.full_name ||
            user.email ||
            "Staff",
        ),
        role: staff.role as StaffIdentity["role"],
      },
    };
  }

  async requirePos() {
    const access = await this.verify();

    if (
      access.kind !== "staff" ||
      !canViewModule(access.staff.role, "pos")
    ) {
      throw new ApiError(
        "Your active role does not permit register access.",
        403,
      );
    }
  }

  async catalogue(
    search: string,
    locationId: string | null,
    offset = 0,
  ): Promise<PosCatalogue> {
    await this.requirePos();

    if (locationId && !UUID.test(locationId)) {
      throw new ApiError("Choose a valid store.");
    }

    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 1_000_000
    ) {
      throw new ApiError("Invalid catalogue page.");
    }

    const params = new URLSearchParams({
      search: search.trim().slice(0, 100),
      offset: String(offset),
      limit: "40",
    });

    if (locationId) {
      params.set("locationId", locationId);
    }

    const data = await this.edge<PosCatalogue>(
      "pos-register",
      params,
    );

    if (
      !Array.isArray(data.items) ||
      !data.items.every(validProduct) ||
      !Array.isArray(data.locations) ||

      data.locations.some(
        location => !UUID.test(location.id),
      ) ||

      (
        data.selectedLocationId &&
        !data.locations.some(
          location =>
            location.id === data.selectedLocationId,
        )
      )
    ) {
      throw new ApiError(
        "The register returned invalid product or store data.",
      );
    }

    return {
      ...data,

      paymentVersion:
        data.paymentVersion === 2
          ? 2
          : undefined,

      receivingAccount:
        validReceivingAccount(data.receivingAccount)
          ? data.receivingAccount
          : null,
    };
  }

  async checkout(
    request: CashSaleRequest,
  ): Promise<PosReceipt> {
    if (!validSaleRequest(request)) {
      throw new ApiError(
        "Invalid saved transaction. Check the items and payment amounts.",
        400,
      );
    }

    await this.requirePos();

    const data = await this.edge<{
      receipt: PosReceipt;
    }>(
      "pos-register",
      undefined,
      { action: "checkout", ...request },
    );

    if (
      !validateReceipt(data.receipt) ||
      data.receipt.locationId !== request.locationId ||
      data.receipt.discountMinor !== request.discountMinor ||

      data.receipt.totalMinor !==
        request.items.reduce(
          (sum, item) =>
            sum +
            item.quantity * item.expectedPriceMinor,
          0,
        ) - request.discountMinor ||

      !receiptPaymentMatches(data.receipt, request) ||
      data.receipt.items.length !== request.items.length ||

      !request.items.every(item =>
        data.receipt.items.some(
          line =>
            line.variantId === item.variantId &&
            line.quantity === item.quantity &&
            line.unitPriceMinor === item.expectedPriceMinor,
        ),
      )
    ) {
      throw new ApiError(
        "Receipt confirmation is incomplete. Retry the same transaction reference.",
      );
    }

    return data.receipt;
  }

  async receipt(saleId: string) {
    await this.requirePos();

    const data = await this.edge<{
      receipt: PosReceipt;
    }>(
      "pos-register",
      new URLSearchParams({
        view: "receipt",
        saleId,
      }),
    );

    if (!validateReceipt(data.receipt)) {
      throw new ApiError(
        "The receipt response is incomplete.",
      );
    }

    return data.receipt;
  }

  async replacePassword(
    currentPassword: string,
    password: string,
    confirmation: string,
  ) {
    const {
      data: { session },
    } = await this.auth.auth.getSession();

    if (!session) {
      throw new ApiError("Sign in again.", 401);
    }

    let response: Response;

    try {
      response = await this.fetcher(
        new URL(
          "/api/staff/password-enrollment",
          this.config.workspaceUrl,
        ),
        {
          method: "POST",

          headers: {
            authorization: "Bearer " + session.access_token,
            "content-type": "application/json",
          },

          body: JSON.stringify({
            currentPassword,
            password,
            confirmation,
          }),

          signal: AbortSignal.timeout(30_000),
          redirect: "error",
        },
      );
    } catch {
      throw new ApiError(
        "Password setup could not reach the Golden Rose web server. Check VITE_WORKSPACE_URL and the staff endpoint release.",
      );
    }

    const data = await response.json().catch(
      () => null,
    );

    if (!response.ok) {
      throw new ApiError(
        data?.error ||
          "Password setup could not be completed.",
        response.status,
      );
    }

    await this.auth.auth.signOut({
      scope: "local",
    });
  }
}

export function createDesktopApi(
  config: DesktopConfig,
) {
  return new DesktopApi(
    createClient(
      config.url,
      config.publishableKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: "golden-rose-desktop-auth",
        },
      },
    ),
    config,
  );
}