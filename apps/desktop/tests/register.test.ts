import { describe, expect, it } from "vitest";
import {
  addProduct,
  calculate,
  cashChange,
  emptyRegister,
  exactMatches,
  nairaToKobo,
  saleTotals,
  ROLE_MODULES,
  type PosProduct,
  type Role,
} from "../src/domain";
import { readConfig, PROJECT_URL } from "../src/config";
import { ApiError, DesktopApi } from "../src/api";
import { registerStorage } from "../src/storage";
import type { SupabaseClient } from "@supabase/supabase-js";
import { customerSale, parseCustomerSale } from "../src/customer-display";

const product: PosProduct = {
  id: "00000000-0000-4000-8000-000000000001",
  productId: "00000000-0000-4000-8000-000000000002",
  name: "Isolated test fragrance",
  brand: null,
  sku: "00001",
  barcode: "000012345678",
  priceMinor: 12345,
  sizeMl: 50,
  currency: "NGN",
  available: 30,
  imagePath: null,
};

const config = {
  url: PROJECT_URL,
  publishableKey: "sb_publishable_fixture",
  workspaceUrl: "http://localhost:3000",
};

describe("Customer display privacy", () => {
  it("projects only customer-visible sale fields and removes injected internal metadata", () => {
    const projected = customerSale(
      [{ product, quantity: 2 }],
      24690,
      100,
      24590,
      "shopping",
    );

    expect(Object.keys(projected.items[0]).sort()).toEqual([
      "name",
      "priceMinor",
      "quantity",
    ]);

    const received = parseCustomerSale({
      ...projected,
      email: "private@example.test",
      token: "private",
      items: [
        {
          ...projected.items[0],
          sku: "internal",
          staffEmail: "private@example.test",
        },
      ],
    });

    expect(received).toEqual(projected);

    expect(JSON.stringify(received)).not.toMatch(
      /private|staffEmail|sku|token/,
    );
  });

  it("rejects invalid money, invalid quantities and malformed display messages", () => {
    expect(
      parseCustomerSale({
        status: "shopping",
        items: [],
        subtotalMinor: 1.5,
        discountMinor: 0,
        totalMinor: 1.5,
      }),
    ).toBeNull();

    expect(
      parseCustomerSale({
        status: "complete",
        items: [{ name: "bad", quantity: -1, priceMinor: 100 }],
        subtotalMinor: 0,
        discountMinor: 0,
        totalMinor: 0,
      }),
    ).toBeNull();
  });
});

describe("Register arithmetic and scanning", () => {
  it("preserves integer kobo and leading-zero barcodes", () => {
    expect(nairaToKobo("123.45")).toBe(12345);
    expect(nairaToKobo("1.001")).toBeNull();
    expect(exactMatches([product], "000012345678")).toEqual([product]);
    expect(exactMatches([product], "12345678")).toEqual([]);
  });

  it("increments repeated scans without merging distinct variants", () => {
    const second = {
      ...product,
      id: "00000000-0000-4000-8000-000000000003",
    };

    const basket = addProduct(
      addProduct(addProduct([], product), product),
      second,
    );

    expect(basket.map((line) => line.quantity)).toEqual([2, 1]);

    expect(saleTotals(basket, 345)).toEqual({
      subtotalMinor: 37035,
      discountMinor: 345,
      totalMinor: 36690,
    });

    expect(cashChange(36690, 50000)).toBe(13310);
  });

  it("rejects unavailable stock, invalid prices, unsafe discounts and insufficient tender", () => {
    expect(() =>
      addProduct([], { ...product, available: 0 }),
    ).toThrow(/stock/);

    expect(() =>
      addProduct([], { ...product, priceMinor: 12.5 }),
    ).toThrow(/price/);

    expect(() =>
      saleTotals(addProduct([], product), 12346),
    ).toThrow(/discount/);

    expect(() =>
      cashChange(12345, 12000),
    ).toThrow(/cover/);

    expect(() =>
      cashChange(12345, 12345.5),
    ).toThrow();
  });

  it("supports 21 independent lines and enforces the existing 40-variant API limit", () => {
    let lines = addProduct([], product);

    for (let i = 2; i <= 40; i++) {
      lines = addProduct(lines, {
        ...product,
        id:
          "00000000-0000-4000-8000-" +
          String(i).padStart(12, "0"),
      });
    }

    expect(lines).toHaveLength(40);

    expect(() =>
      addProduct(lines, {
        ...product,
        id: "00000000-0000-4000-8000-000000000099",
      }),
    ).toThrow(/40/);
  });

  it("calculates without evaluating arbitrary expressions", () => {
    expect(calculate("3 × 12500")).toBe(37500);
    expect(calculate("10 / 4")).toBe(2.5);
    expect(calculate("-2 + 5")).toBe(3);

    expect(() => calculate("1/0")).toThrow(/zero/);
    expect(() => calculate("alert(1)")).toThrow();
  });
});

describe("Staff and server authorization", () => {
  function api(
    role: Role | null = "cashier",
    state = "none",
    status = 200,
  ) {
    const calls: {
      url: string;
      body: unknown;
    }[] = [];

    const auth = {
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: product.productId,
              email: "fixture@example.test",
              email_confirmed_at: "2026-01-01",
              user_metadata: {},
            },
          },
        }),

        getSession: async () => ({
          data: {
            session: {
              access_token: "fixture-token",
            },
          },
        }),
      },

      rpc: async () => ({
        data: state,
      }),
    } as unknown as SupabaseClient;

    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);

      calls.push({
        url,
        body: init?.body
          ? JSON.parse(String(init.body))
          : null,
      });

      return Response.json(
        url.includes("staff-session")
          ? {
              isStaff: role !== null && role !== "customer",
              role,
            }
          : {
              ok: false,
              error: "Insufficient available stock.",
            },
        {
          status: url.includes("staff-session")
            ? 200
            : status,
        },
      );
    };

    return {
      client: new DesktopApi(auth, config, fetcher),
      calls,
    };
  }

  it("cashier has POS and Amara access while owner retains the shared module permissions", () => {
    expect(ROLE_MODULES.cashier).toEqual([
      "pos",
      "assistant",
    ]);

    expect(ROLE_MODULES.owner).toContain("staff");

    expect(ROLE_MODULES.inventory_staff).not.toContain(
      "pos",
    );
  });

  it.each([
    "customer",
    "inventory_staff",
    "accountant",
    "sales_staff",
  ] as const)(
    "denies %s before dispatching a POS request",
    async (role) => {
      const { client, calls } = api(role);

      await expect(
        client.catalogue("", null),
      ).rejects.toThrow(/role|membership/);

      expect(
        calls.some((call) =>
          call.url.includes("pos-register"),
        ),
      ).toBe(false);
    },
  );

  it("rejects suspended or revoked staff and expired password enrollment", async () => {
    await expect(
      api(null).client.verify(),
    ).rejects.toThrow(/membership/);

    await expect(
      api("cashier", "expired").client.verify(),
    ).rejects.toThrow(/expired/);
  });

  it("routes temporary-password staff to enrollment before granting a role", async () => {
    const { client, calls } = api(
      "cashier",
      "change_required",
    );

    expect((await client.verify()).kind).toBe(
      "enrollment",
    );

    expect(calls).toHaveLength(0);
  });

  it("preserves the idempotency payload and exposes server stock rejections", async () => {
    const { client, calls } = api(
      "cashier",
      "none",
      409,
    );

    const request = {
      idempotencyKey: crypto.randomUUID(),
      locationId: product.productId,
      method: "cash" as const,

      items: [
        {
          variantId: product.id,
          quantity: 1,
          expectedPriceMinor: product.priceMinor,
        },
      ],

      discountMinor: 0,
      tenderedMinor: 20000,
    };

    await expect(
      client.checkout(request),
    ).rejects.toMatchObject({
      status: 409,
      message: "Insufficient available stock.",
    });

    await expect(
      client.checkout(request),
    ).rejects.toBeInstanceOf(ApiError);

    expect(
      calls
        .filter((call) =>
          call.url.includes("pos-register"),
        )
        .map((call) => call.body),
    ).toEqual([
      { action: "checkout", ...request },
      { action: "checkout", ...request },
    ]);
  });
});

describe("Configuration and recovery", () => {
  it("rejects privileged keys and other Supabase projects", () => {
    expect(() =>
      readConfig({
        VITE_SUPABASE_URL: PROJECT_URL,
        VITE_SUPABASE_PUBLISHABLE_KEY:
          "sb_secret_forbidden",
      }),
    ).toThrow(/publishable/);

    expect(() =>
      readConfig({
        VITE_SUPABASE_URL:
          "https://another.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY:
          "sb_publishable_fixture",
      }),
    ).toThrow(/designated/);
  });

  it("restores pending references on refresh and isolates employee baskets", () => {
    const memory = new Map<string, string>();

    const storage = {
      getItem: (key: string) =>
        memory.get(key) ?? null,

      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    } as Storage;

    const state = emptyRegister();

    state.draft.lines = addProduct([], product);
    state.draft.locationId = product.productId;

    state.draft.pending = {
      idempotencyKey: crypto.randomUUID(),
      locationId: product.productId,
      method: "cash",

      items: [
        {
          variantId: product.id,
          quantity: 1,
          expectedPriceMinor: 12345,
        },
      ],

      discountMinor: 0,
      tenderedMinor: 20000,
    };

    registerStorage(
      "employee-one",
      storage,
    ).save(state);

    expect(
      registerStorage(
        "employee-one",
        storage,
      ).load(),
    ).toEqual(state);

    expect(
      registerStorage(
        "employee-two",
        storage,
      ).load().draft.lines,
    ).toEqual([]);

    memory.set(
      "golden-rose-register-v1:employee-one",
      "{broken",
    );

    expect(() =>
      registerStorage(
        "employee-one",
        storage,
      ).load(),
    ).toThrow();
  });
});