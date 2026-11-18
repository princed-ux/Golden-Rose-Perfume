import { test, expect } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { products } from "./fixtures";

let server: ViteDevServer;
let address: string;

// Mount the actual web register with isolated action replacements. This is a test
// server, not a production route or an authentication bypass in the application.
test.beforeAll(async () => {
  const root = await mkdtemp(join(tmpdir(), "golden-rose-web-pos-"));
  const locationId = "00000000-0000-4000-8000-000000000002";
  const catalogue = {
    items: products,
    selectedLocationId: locationId,
    locations: [
      { id: locationId, name: "Fixture store", code: "TEST", type: "store" },
    ],
    hasMore: false,
  };
  await writeFile(
    join(root, "index.html"),
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#fcfaf9"><div id="root"></div><script type="module" src="/entry.tsx"></script></body></html>',
  );
  await writeFile(
    join(root, "entry.tsx"),
    `import React from 'react'; import {createRoot} from 'react-dom/client'; import {PosRegister} from '@web-register'; import '@web-styles'; createRoot(document.getElementById('root')).render(<PosRegister initial={${JSON.stringify(catalogue)}} loadError={null} role="cashier"/>);`,
  );
  await writeFile(
    join(root, "image.tsx"),
    `import React from 'react'; export default function Image({src,alt,width,height,className,style}){return <img src={src} alt={alt} width={width} height={height} className={className} style={style}/>;}`,
  );
  await writeFile(
    join(root, "link.tsx"),
    `import React from 'react'; export default function Link(props){return <a {...props}/>;}`,
  );
  await writeFile(
    join(root, "actions.ts"),
    `const catalogue=${JSON.stringify(catalogue)};
    export async function loadPosCatalogue(search='',locationId=null,offset=0){const q=search.toLowerCase();return {...catalogue,items:catalogue.items.filter(p=>!q||[p.name,p.sku,p.barcode].some(s=>s.toLowerCase().includes(q))).slice(offset)};}
    export async function completeCashSale(request){window.__webCheckoutRequests??=[];window.__webCheckoutRequests.push(request);const items=request.items.map(line=>{const p=catalogue.items.find(p=>p.id===line.variantId);return {variantId:p.id,name:p.name,sku:p.sku,sizeMl:p.sizeMl,quantity:line.quantity,unitPriceMinor:p.priceMinor,lineTotalMinor:line.quantity*p.priceMinor}});const subtotalMinor=items.reduce((sum,line)=>sum+line.lineTotalMinor,0);return {saleId:'00000000-0000-4000-8000-000000009999',saleNumber:1,createdAt:new Date().toISOString(),locationId:request.locationId,locationName:'Fixture store',cashierId:'00000000-0000-4000-8000-000000000001',currency:'NGN',method:'cash',items,subtotalMinor,discountMinor:request.discountMinor,taxMinor:0,totalMinor:subtotalMinor-request.discountMinor,tenderedMinor:request.tenderedMinor,changeMinor:request.tenderedMinor-subtotalMinor+request.discountMinor};}
  `,
  );
  server = await createServer({
    configFile: false,
    root,
    publicDir: resolve("../../public"),
    plugins: [react()],
    define: {
      "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(
        "https://eixbmsethgrtezhdmgsh.supabase.co",
      ),
    },
    resolve: {
      alias: [
        {
          find: "@web-register",
          replacement: resolve("../../app/workspace/pos/register.tsx"),
        },
        {
          find: "@web-styles",
          replacement: resolve("../../app/workspace/pos/pos.css"),
        },
        { find: "next/image", replacement: join(root, "image.tsx") },
        { find: "next/link", replacement: join(root, "link.tsx") },
        { find: "./actions", replacement: join(root, "actions.ts") },
        { find: "react-dom", replacement: resolve("node_modules/react-dom") },
        { find: "react", replacement: resolve("node_modules/react") },
        {
          find: "lucide-react",
          replacement: resolve("node_modules/lucide-react"),
        },
      ],
    },
    server: {
      host: "127.0.0.1",
      port: 0,
      fs: { allow: [root, resolve("../..")] },
    },
  });
  await server.listen();
  address = server.resolvedUrls!.local[0];
});
test.afterAll(async () => {
  await server?.close();
});

test("web register keeps checkout visible for 21 lines and uses the new modal sequence", async ({
  page,
}, info) => {
  await page.route("https://eixbmsethgrtezhdmgsh.supabase.co/**", (route) =>
    route.abort(),
  );
  await page.goto(address);
  await expect(
    page.getByRole("region", { name: "Product table", exact: true }),
  ).toBeVisible();
  for (const product of products.slice(0, 21))
    await page
      .getByRole("button", {
        name: "Add " + product.name + " to current sale",
        exact: true,
      })
      .click();
  const checkout = page.getByRole("button", { name: "Checkout", exact: true });
  await expect(checkout).toBeInViewport();
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(checkout).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("web-register-" + width + ".png"),
    });
  }
  await checkout.click();
  await expect(
    page.getByRole("heading", { name: "Confirm sale", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Bank transfer/ }),
  ).toBeDisabled();
  await page.keyboard.press("Control+Enter");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __webCheckoutRequests?: unknown[] })
          .__webCheckoutRequests?.length ?? 0,
    ),
  ).toBe(0);
  await page.getByRole("button", { name: "Cash payment", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Payment details", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Exact amount", exact: true }).click();
  await page.screenshot({ path: info.outputPath("web-payment-details.png") });
  await page
    .getByRole("button", { name: "Confirm cash sale", exact: true })
    .click();
  await expect(page.locator(".pos-receipt-paper")).toBeVisible();
  const requests = await page.evaluate(
    () =>
      (
        window as unknown as {
          __webCheckoutRequests: { method: string; items: unknown[] }[];
        }
      ).__webCheckoutRequests,
  );
  expect(requests).toHaveLength(1);
  expect(requests[0].method).toBe("cash");
  expect(requests[0].items).toHaveLength(21);
});

test("web mobile drawer and confirm-sale dialog fit a 390px screen", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(address);
  await page
    .getByRole("button", {
      name: "Add " + products[0].name + " to current sale",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: /View current sale/ }).click();
  await page.getByRole("button", { name: "Checkout", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Confirm sale", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("web-mobile-390.png") });
});
