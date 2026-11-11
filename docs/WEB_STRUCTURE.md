# Web structure and page foundations

The application uses the existing root `app/` directory. This is one application for Golden Rose Perfume. Existing source, configuration, assets, and the first merge's uncommitted changes were retained.

## Directory tree

```text
golden-rose-perfume/
  app/
    layout.tsx                 # Global metadata and stylesheet imports
    page.tsx                   # Existing storefront and static hero
    globals.css                # Existing Tailwind setup
    starter.css                # Existing provisional frontend styling
    favicon.ico
    account/
      layout.tsx               # Customer header and account navigation
      page.tsx                 # Customer overview foundation
      orders/page.tsx          # Customer purchase-history foundation
      settings/page.tsx        # Customer profile/preferences foundation
    shop/
      page.tsx
      [slug]/page.tsx
    cart/page.tsx
    checkout/page.tsx
    staff/sign-in/page.tsx     # Explicitly disconnected sign-in placeholder
    workspace/
      layout.tsx               # Shared business shell and sidebar
      page.tsx                 # Business overview
      [module]/page.tsx        # All registered business-module previews
    api/status/route.ts
  src/
    components/
      site-header.tsx
      workspace-sidebar.tsx
      product-card.tsx
      bottle-art.tsx
    domain/
      index.ts
      types.ts
      modules.ts
      permissions.ts
      permissions.test.ts
    lib/
      demo-data.ts
      module-content.ts
  public/
    assets/
      brand/.gitkeep
      hero/.gitkeep
      products/.gitkeep
      categories/.gitkeep
    [existing starter SVG assets retained]
  docs/
    WEB_STRUCTURE.md
    INITIAL_MERGE.md
    starter/
      ARCHITECTURE.md
      BUILD_ROADMAP.md
      AI_AND_VOICE.md
      AI_PACKAGE.md
      DATABASE_PACKAGE.md
  [existing package files and Next.js, TypeScript and ESLint configuration]
```

## Customer routes

New foundations: `/account`, `/account/orders`, `/account/settings`.

Retained: `/`, `/shop`, `/shop/[slug]`, `/cart`, `/checkout`. The shared website header now links to the customer account. The account layout has its own customer navigation and does not include the business sidebar. These are explicit public previews; no one is treated as signed in and no personal data is collected.

## Business routes

All requested routes already existed and remain supported through the shared `workspace/layout.tsx`, module registry, and dynamic module page:

```text
/workspace
/workspace/pos
/workspace/orders
/workspace/invoices
/workspace/products
/workspace/inventory
/workspace/purchases
/workspace/suppliers
/workspace/customers
/workspace/reports
/workspace/staff
/workspace/assistant
/workspace/settings
/workspace/audit
```

`/workspace/overview` is also an existing module preview; the sidebar's Overview link uses `/workspace`. Unknown module IDs and unknown product IDs use Next.js `notFound()`.

## Authentication foundation

The shared domain `Role` type retains customer, owner, manager, cashier, inventory_clerk and fulfillment. `getRoleHome()` describes the future destination policy: customer goes to `/account`; business roles go to `/workspace`. `ROLE_MODULES` and `canViewModule()` describe module visibility only.

A future shared provider/session layer must verify identity and role on the server before applying that destination policy. Account pages must restrict queries to the signed-in customer. Workspace endpoints must enforce their own permissions. Nothing here creates sessions, signs in a user, redirects an unverified visitor or protects a route. There are no authentication-provider or database connections.

## Assets and homepage preparation

Add original logo files to `public/assets/brand/`, approved hero photographs to `public/assets/hero/`, catalogue photographs to `public/assets/products/`, and collection images to `public/assets/categories/`. References use `/assets/...`, without the `public` prefix. These directories are intentionally empty; pages render without photographs.

The existing static hero, collection, shopping buttons and CSS bottle illustrations are retained. The homepage comment marks where approved hero photographs can replace the current visual later. The future full-background slideshow will preserve shopping links, adapt to mobile, use fade/subtle zoom and overlay text, and provide a static fallback for `prefers-reduced-motion`. No slideshow behavior or final design has been invented.

The original gold bottle, red rose, lettering and Beauty Of Fragrance brand identity await the owner's original assets. No logo redesign or generated product photography was added.

## Metadata

Application name: Golden Rose Perfume. Default title: Golden Rose Perfume — Beauty Of Fragrance. Description: An online destination for perfumes and fragrances. The preview's existing no-index metadata remains. No social image, business address or unconfirmed information was introduced.

## Changes in this organization pass

Existing files modified: `app/layout.tsx`, `app/page.tsx`, `src/components/site-header.tsx`, `src/domain/permissions.ts`.

Added: four customer account files, four asset-directory marker files, and this report. All four existing shared components were retained; no extra component hierarchy or hooks were added. New account pages use the existing Tailwind setup and shared visual styles. Page-specific content remains inside each page. No dependencies were installed in this pass.

## Validation

Route types were refreshed with the installed Next.js `typegen` command after new account routes made the cached development and production route types differ. The subsequent standalone TypeScript check passed. All four imported domain permission tests passed.

Production build: `npm run build` passed with exit code 0 and generated all 32 static pages. Next.js reported no duplicate or conflicting routes.

Production HTTP checks passed for 26 pages: all customer routes (including all three product examples), staff sign-in, workspace overview, and every registered workspace module. Each returned HTTP 200 with a page heading. All 25 internal navigation targets resolved to checked pages, including the Collections anchor. Customer account pages had customer navigation and no business sidebar; workspace pages had the shared business shell and module navigation. Metadata and `/api/status` demo flags were also checked. These were server-response checks, not browser click or visual-layout tests.

`git diff --check` passed. The retained React components and new pages use server components with no new client state, custom hooks or data requests. The production verification server was stopped after testing. This completes the build and route checks left incomplete at the initial merge's timebox.

Attention: Next.js still warns that it ignores `C:/Users/HP/package-lock.json` outside this repository. This did not prevent the build or route checks, and the existing Next.js configuration was left unchanged. Customer accounts, real images, protected sessions and backend capabilities remain future work, as requested. No final UI design was selected or implemented.
