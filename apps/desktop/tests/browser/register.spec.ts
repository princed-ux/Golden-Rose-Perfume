import { test, expect } from "@playwright/test";
import { backend, login, products } from "./fixtures";

test("cashier register handles scanning, independent quantities, cash, receipt and sign-out", async ({
  page,
}, info) => {
  const requests = await backend(page);
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Find a fragrance" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Authorized modules" }),
  ).toHaveCount(0);
  const search = page.getByRole("textbox", {
    name: "Search products or scan barcode",
  });
  await search.fill(products[0].barcode);
  await search.press("Enter");
  await expect(page.getByLabel("Quantity for " + products[0].name)).toHaveValue(
    "1",
  );
  await expect(page.getByRole("button", { name: "Find / Add" })).toBeEnabled();
  await search.fill(products[0].barcode);
  await search.press("Enter");
  await expect(page.getByLabel("Quantity for " + products[0].name)).toHaveValue(
    "2",
  );
  await search.fill("");
  await page
    .getByRole("button", { name: "Add " + products[1].name, exact: true })
    .click();
  await expect(page.getByLabel("Quantity for " + products[1].name)).toHaveValue(
    "1",
  );
  await page.getByRole("button", { name: /^Checkout/ }).click();
  await page.getByLabel("Discount (₦)").fill("100");
  await page.getByRole("button", { name: "Cash payment", exact: true }).click();
  await page.getByRole("button", { name: "Exact cash" }).click();
  await page.getByRole("button", { name: "Confirm cash payment" }).click();
  await expect(
    page.getByRole("heading", { name: "Receipt", exact: true }),
  ).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0].discountMinor).toBe(10000);
  expect(requests[0].tenderedMinor).toBe(3740000);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.screenshot({
    path: info.outputPath("register-1440.png"),
    fullPage: false,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Staff sign in" }),
  ).toBeVisible();
});

test("checkout follows confirm, payment and receipt without enabling unsupported methods", async ({
  page,
}, info) => {
  const requests = await backend(page);
  await login(page);
  await page
    .getByRole("button", { name: "Add " + products[0].name, exact: true })
    .click();
  await page.keyboard.press("F12");
  await expect(
    page.getByRole("heading", { name: "Confirm sale", exact: true }),
  ).toBeVisible();
  // Bank details are previewable, but completing an unverified transfer is blocked.
  await page.getByRole("button", { name: "Bank transfer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bank transfer" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Awaiting payment integration" }),
  ).toBeDisabled();
  expect(requests).toHaveLength(0);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "POS terminal", exact: true }),
  ).toBeDisabled();
  expect(requests).toHaveLength(0);
  await page.screenshot({ path: info.outputPath("confirm-sale.png") });
  await page.getByRole("button", { name: "Cash payment", exact: true }).click();
  await page
    .getByRole("group", { name: "Quick cash amounts" })
    .getByRole("button", { name: "₦1,000", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm cash payment", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Exact cash" }).click();
  await page.screenshot({ path: info.outputPath("payment-details.png") });
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Confirm sale" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cash payment", exact: true }).click();
  await page.getByLabel("Cash received (₦)").press("Control+Enter");
  await expect(
    page.getByRole("heading", { name: "Receipt", exact: true }),
  ).toBeVisible();
  expect(requests).toHaveLength(1);
  await page.screenshot({ path: info.outputPath("receipt.png") });
});

test("rapid repeated HID scans and keyboard shortcuts preserve independent basket lines", async ({
  page,
}) => {
  await backend(page, { remoteScan: true });
  await login(page);
  await expect(
    page.getByRole("button", { name: "Add " + products[0].name, exact: true }),
  ).toBeVisible();
  await page.keyboard.press("F2");
  for (let i = 0; i < 6; i++) {
    await page.keyboard.type(products[23].barcode);
    await page.keyboard.press("Enter");
  }
  await expect(
    page.getByLabel("Quantity for " + products[23].name),
  ).toHaveValue("6");
  await page
    .getByRole("button", { name: "Add " + products[1].name, exact: true })
    .click();
  await page.getByLabel("Quantity for " + products[1].name).fill("3");
  await expect(
    page.getByLabel("Quantity for " + products[23].name),
  ).toHaveValue("6");
  await page.keyboard.press("F4");
  await expect(page.locator(".basket-line")).toHaveCount(0);
  await page.keyboard.press("F6");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Recall", exact: true })
    .click();
  await expect(
    page.getByLabel("Quantity for " + products[23].name),
  ).toHaveValue("6");
  await page.keyboard.press("F8");
  await expect(
    page.getByRole("dialog", { name: "Calculator", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("customer display mirrors only public items and totals and clears on logout", async ({
  page,
  context,
}, info) => {
  await backend(page);
  const customerRequests: string[] = [];
  await context.route(
    "https://eixbmsethgrtezhdmgsh.supabase.co/**",
    (route) => {
      customerRequests.push(new URL(route.request().url()).pathname);
      return route.abort();
    },
  );
  await login(page);
  await page
    .getByRole("button", { name: "Add " + products[0].name, exact: true })
    .click();
  const opened = context.waitForEvent("page");
  await page
    .getByRole("button", { name: "Customer display", exact: true })
    .click();
  const customer = await opened;
  await expect(
    customer.getByRole("heading", { name: products[0].name, exact: true }),
  ).toBeVisible();
  await expect(customer.locator(".customer-total")).toHaveText("₦12,500");
  await expect(customer.locator("body")).not.toContainText(
    "fixture@example.test",
  );
  await expect(customer.getByRole("button")).toHaveCount(0);
  await expect(customer.getByRole("textbox")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Add " + products[0].name, exact: true })
    .click();
  await expect(customer.locator(".customer-total")).toHaveText("₦25,000");
  expect(customerRequests).toHaveLength(0);
  await customer.screenshot({ path: info.outputPath("customer-display.png") });
  await page.reload();
  await page
    .getByRole("button", { name: "Add " + products[0].name, exact: true })
    .click();
  await expect(customer.locator(".customer-total")).toHaveText("₦37,500");
  await page.getByRole("button", { name: /^Checkout/ }).click();
  await page.getByRole("button", { name: "Cash payment", exact: true }).click();
  await page.getByRole("button", { name: "Exact cash", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm cash payment", exact: true })
    .click();
  await expect(
    customer.getByText("Payment confirmed", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(
    customer.getByRole("heading", { name: "Find your signature fragrance." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sales history", exact: true })
    .click();
  await page.getByRole("button", { name: /Sale #1/ }).click();
  await expect(
    page.getByRole("heading", { name: "Receipt", exact: true }),
  ).toBeVisible();
  await expect(
    customer.getByRole("heading", { name: "Find your signature fragrance." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    customer.getByRole("heading", { name: "Find your signature fragrance." }),
  ).toBeVisible();
  await customer.close();
});

test("cashier can hold, recall, calculate and keep a 21-line basket usable", async ({
  page,
}, info) => {
  await backend(page);
  await login(page);
  for (const product of products.slice(0, 21))
    await page
      .getByRole("button", { name: "Add " + product.name, exact: true })
      .click();
  await expect(page.locator(".basket-line")).toHaveCount(21);
  await expect(
    page.getByRole("button", { name: /^Checkout/ }),
  ).toBeInViewport();
  await page.getByRole("button", { name: "Hold", exact: true }).click();
  await expect(page.locator(".basket-line")).toHaveCount(0);
  await page.getByRole("button", { name: /^Recall/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Recall", exact: true })
    .click();
  await expect(page.locator(".basket-line")).toHaveCount(21);
  await page.getByRole("button", { name: "Calculator", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Calculation", exact: true })
    .fill("3 × 12500");
  await page.getByRole("button", { name: "Calculate", exact: true }).click();
  await expect(page.locator("output")).toHaveText("37500");
  await page.getByRole("button", { name: "Close dialog" }).click();
  for (const width of [1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: width === 1024 ? 768 : 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("register-" + width + ".png"),
      fullPage: true,
    });
  }
});

test("compact cashier and payment controls fit mobile widths", async ({
  page,
}, info) => {
  await backend(page);
  await login(page);
  await page
    .getByRole("button", { name: "Add " + products[0].name, exact: true })
    .click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(
      page.getByRole("button", { name: /^Checkout/ }),
    ).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("cashier-mobile-" + width + ".png"),
    });
  }
  await page.getByRole("button", { name: /^Checkout/ }).click();
  await page.getByRole("button", { name: "Cash payment", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Confirm cash payment", exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: info.outputPath("payment-mobile-320.png") });
});

test("uncertain payment survives refresh and retries the identical payload", async ({
  page,
}) => {
  const requests = await backend(page, { interrupt: true });
  await login(page);
  await page
    .getByRole("button", { name: "Add " + products[0].name, exact: true })
    .click();
  await page.getByRole("button", { name: /^Checkout/ }).click();
  await page.getByRole("button", { name: "Cash payment", exact: true }).click();
  await page.getByRole("button", { name: "Exact cash" }).click();
  await page.getByRole("button", { name: "Confirm cash payment" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Confirmation unavailable",
  );
  await page.reload();
  await page.getByRole("button", { name: "Recover transaction" }).click();
  await page.getByRole("button", { name: "Retry same transaction" }).click();
  await expect(
    page.getByRole("heading", { name: "Receipt", exact: true }),
  ).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
});

test("server stock errors stay visible and do not create a receipt", async ({
  page,
}) => {
  await backend(page, { stockError: true });
  await login(page);
  await expect(
    page.getByRole("button", { name: "Add " + products[24].name, exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Add " + products[0].name, exact: true })
    .click();
  await page.getByRole("button", { name: /^Checkout/ }).click();
  await page.getByRole("button", { name: "Cash payment", exact: true }).click();
  await page.getByRole("button", { name: "Exact cash" }).click();
  await page.getByRole("button", { name: "Confirm cash payment" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Insufficient available stock",
  );
  await expect(
    page.getByRole("heading", { name: "Receipt", exact: true }),
  ).toHaveCount(0);
});

test("owner keeps all modules and can independently open the desktop register", async ({
  page,
}) => {
  await backend(page, { role: "owner" });
  await login(page);
  await expect(
    page
      .getByRole("navigation", { name: "Authorized modules" })
      .getByRole("button", { name: "Staff & Roles" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open register", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Find a fragrance" }),
  ).toBeVisible();
});

for (const options of [{ role: "customer" }, { suspended: true }])
  test("denies " + (options.role || "suspended staff"), async ({ page }) => {
    await backend(page, options);
    await login(page);
    await expect(page.getByRole("alert")).toContainText("active staff");
    await expect(
      page.getByRole("heading", { name: "Find a fragrance" }),
    ).toHaveCount(0);
  });

test("temporary credentials require password setup before the register", async ({
  page,
}) => {
  await backend(page, { enrollment: true });
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Set your own password" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Find a fragrance" }),
  ).toHaveCount(0);
});

for (const [role, heading] of [
  ["manager", "Overview"],
  ["inventory_staff", "Inventory"],
  ["sales_staff", "Orders & Sales"],
  ["accountant", "Invoices"],
]) {
  test(role + " opens its authorized module landing", async ({ page }) => {
    await backend(page, { role });
    await login(page);
    await expect(
      page.getByRole("heading", { name: heading, exact: true, level: 1 }),
    ).toBeVisible();
    const navigation = page.getByRole("navigation", {
      name: "Authorized modules",
    });
    await expect(navigation).toBeVisible();
    if (role !== "manager")
      await expect(
        navigation.getByRole("button", { name: "Point of Sale", exact: true }),
      ).toHaveCount(0);
  });
}
