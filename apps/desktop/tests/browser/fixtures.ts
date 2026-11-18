import { type Page } from "@playwright/test";

const userId = "00000000-0000-4000-8000-000000000001";
const locationId = "00000000-0000-4000-8000-000000000002";
export const products = Array.from({ length: 25 }, (_, index) => ({
  id: "00000000-0000-4000-8000-" + String(100 + index).padStart(12, "0"),
  productId: "00000000-0000-4000-8000-" + String(200 + index).padStart(12, "0"),
  name: "Fixture fragrance " + String(index + 1).padStart(2, "0"),
  brand: "Isolated fixture",
  sku: "SKU" + index,
  barcode: "00012345" + String(index).padStart(4, "0"),
  sizeMl: 50,
  priceMinor: 1250000,
  currency: "NGN",
  available: index === 24 ? 0 : 30,
  imagePath: null,
}));

export async function backend(
  page: Page,
  options: {
    role?: string;
    suspended?: boolean;
    stockError?: boolean;
    interrupt?: boolean;
    enrollment?: boolean;
    remoteScan?: boolean;
  } = {},
) {
  const requests: Record<string, unknown>[] = [];
  page.on("requestfailed", (request) =>
    console.log(
      "Fixture request failed",
      new URL(request.url()).pathname,
      request.failure()?.errorText,
    ),
  );
  page.on("console", (message) => {
    if (message.type() === "error")
      console.log("Browser error", message.text().slice(0, 220));
  });
  let interrupted = false;
  let lastReceipt: unknown = null;
  const user = {
    id: userId,
    email: "fixture@example.test",
    aud: "authenticated",
    role: "authenticated",
    email_confirmed_at: "2026-01-01T00:00:00Z",
    user_metadata: { full_name: "Fixture Cashier" },
    app_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  };
  const token = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: userId,
        exp: Math.floor(Date.now() / 1000) + 3600,
        session_id: locationId,
      }),
    ).toString("base64url"),
    "signature",
  ].join(".");
  await page.route(
    "https://eixbmsethgrtezhdmgsh.supabase.co/**",
    async (route) => {
      const url = new URL(route.request().url());
      if (route.request().method() === "OPTIONS")
        return route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
          },
        });
      const respond = (body: unknown, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
          },
          body: JSON.stringify(body),
        });
      if (url.pathname.endsWith("/token"))
        return respond({
          access_token: token,
          refresh_token: "fixture-refresh",
          token_type: "bearer",
          expires_in: 3600,
          user,
        });
      if (url.pathname.endsWith("/user")) return respond(user);
      if (url.pathname.endsWith("/logout")) return respond({});
      if (url.pathname.endsWith("/gr_employee_password_state"))
        return respond(options.enrollment ? "change_required" : "none");
      if (url.pathname.endsWith("/staff-session"))
        return respond({
          ok: true,
          isStaff: !options.suspended && options.role !== "customer",
          role: options.role || "cashier",
        });
      if (url.pathname.endsWith("/pos-register")) {
        if (url.searchParams.get("view") === "receipt")
          return respond({ ok: true, receipt: lastReceipt });
        if (route.request().method() === "POST") {
          const body = route.request().postDataJSON();
          requests.push(body);
          if (options.interrupt && !interrupted) {
            interrupted = true;
            return route.abort("connectionfailed");
          }
          if (options.stockError)
            return respond(
              {
                ok: false,
                error:
                  "Insufficient available stock. Refresh the register and check quantities.",
              },
              409,
            );
          const items = body.items.map(
            (line: {
              variantId: string;
              quantity: number;
              expectedPriceMinor: number;
            }) => ({
              variantId: line.variantId,
              name: products.find((product) => product.id === line.variantId)
                ?.name,
              sku: "SKU",
              sizeMl: 50,
              quantity: line.quantity,
              unitPriceMinor: line.expectedPriceMinor,
              lineTotalMinor: line.quantity * line.expectedPriceMinor,
            }),
          );
          const subtotalMinor = items.reduce(
            (sum: number, line: { lineTotalMinor: number }) =>
              sum + line.lineTotalMinor,
            0,
          );
          lastReceipt = {
            saleId: "00000000-0000-4000-8000-000000009999",
            saleNumber: 1,
            createdAt: "2026-11-18T10:00:00Z",
            locationId,
            locationName: "Fixture store",
            cashierId: userId,
            currency: "NGN",
            method: "cash",
            items,
            subtotalMinor,
            discountMinor: body.discountMinor,
            taxMinor: 0,
            totalMinor: subtotalMinor - body.discountMinor,
            tenderedMinor: body.tenderedMinor,
            changeMinor:
              body.tenderedMinor - subtotalMinor + body.discountMinor,
          };
          return respond({ ok: true, receipt: lastReceipt });
        }
        const search = url.searchParams.get("search")?.toLowerCase();
        if (options.remoteScan && search)
          await new Promise((resolve) => setTimeout(resolve, 150));
        const items = search
          ? products.filter((product) =>
              [
                product.name.toLowerCase(),
                product.sku.toLowerCase(),
                product.barcode,
              ].some((value) => value.includes(search)),
            )
          : options.remoteScan
            ? products.filter((product) => product.id !== products[23].id)
            : products;
        return respond({
          ok: true,
          items,
          locations: [
            {
              id: locationId,
              name: "Fixture store",
              code: "TEST",
              type: "store",
            },
          ],
          selectedLocationId: locationId,
          hasMore: false,
        });
      }
      return respond({ error: "Unexpected fixture request" }, 500);
    },
  );
  return requests;
}

export async function login(page: Page) {
  await page.goto("http://127.0.0.1:1420/");
  await page.getByLabel("Work email").fill("fixture@example.test");
  await page.getByLabel("Password", { exact: true }).fill("fixture password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
