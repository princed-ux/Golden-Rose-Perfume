# Golden Rose Perfume desktop application

Tauri 2, React, TypeScript and Vite. This app uses the existing Golden Rose Supabase project and its staff-session and pos-register endpoints. Website files and the transaction backend remain shared.

## Run locally

From `apps/desktop`, run the following commands.

```powershell
npm ci
npm run configure
npm run dev
```

The browser preview is `http://127.0.0.1:1420`. `configure` copies only the existing public Supabase URL and publishable key into this app's ignored `.env.local`. It preserves an existing desktop environment. Set `VITE_WORKSPACE_URL` to the running Golden Rose web server for password enrollment and existing web modules.

The existing Electron development shell can also be opened with `npm run desktop:electron` while Vite is running. This is a local development host, not a packaged Windows installer.

For the native Windows application, install Rust using the MSVC toolchain and Visual Studio C++ Build Tools with the Windows SDK. WebView2 must also be installed. Then use the following commands.

```powershell
npm run prerequisites
npm run desktop:dev
npm run build:windows
```

The Windows installer will be generated beneath `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/` after a successful native build. No installer can be produced without Cargo and the Windows build tools.

## Verification

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:browser
```

The browser tests use installed Google Chrome and intercept all Supabase calls with isolated fixtures. They do not write hosted stock or sales. Screenshots are saved under `test-results/`. An actual work account is required for manual connected acceptance.

## Implemented behavior

- Individual work-email sign-in, persistent Supabase sessions, local sign-out, verified staff-role routing, periodic access checks and initial-password enrollment gating.
- Shared role definitions. Cashiers have the dedicated register and calculator. Authorized non-POS modules open their existing web workspace in the system browser, where web authentication is independently enforced.
- Store-scoped, server-paginated product search, exact SKU/barcode scans, table/grid views, quantities, removal, discounts and integer-kobo cash calculations.
- Device-local baskets and held baskets scoped to the signed-in user. Holding a basket does not reserve stock.
- Cash checkout through the existing transactional POS endpoint. The request and idempotency key are stored before dispatch. An uncertain transaction remains frozen across refreshes and retries with the same payload.
- Compact, independently scrolling catalogue and basket panes with a fixed checkout footer. Checkout follows Confirm sale → Payment details → server-confirmed Receipt. Quick cash amounts, exact cash, discounts and change use integer kobo. Unsupported payment methods remain disabled.
- F2 focuses scanning, F4 holds, F6 recalls, F8 opens the calculator and F12 opens checkout. Ctrl+Enter confirms only within Payment details. Exact local scans increment immediately; remote lookups are queued to preserve repeated scans.
- Customer display opens a separate window and selects a second monitor when one is available in the native host. It receives only product names, quantities, public selling prices and totals. It clears on logout or a missing heartbeat; internal receipt-history viewing is never broadcast. Electron uses an isolated in-memory browser partition and a read-only preload bridge; Tauri uses an incognito webview with event-listening permissions only. Browser fallback uses a session-specific channel and requires pop-ups to be allowed.
- Returned receipt display, Windows print command and browser printing fallback. Sales history contains up to 100 confirmed receipts for this account on this device and rechecks a receipt against the live endpoint before opening it. The current POS endpoint does not supply a complete business-wide sales-history listing.
- The existing API permits 40 distinct variants per transaction and 100 units per line. Larger baskets require a separately reviewed backend contract change.

## Password enrollment release dependency

The new `app/api/staff/password-enrollment/route.ts` belongs to the web server. It verifies the bearer identity, confirmed email, current temporary password, eligible enrollment state and fresh session before changing the password and invoking the existing privileged completion RPC. The desktop receives no privileged key. Existing suspension and store checks stay in the database and Edge Functions.

Release that web route with `SUPABASE_STAFF_ADMIN_SECRET_KEY` configured in the trusted server environment before testing desktop-created employee password enrollment against the hosted application. Tauri origins are allowlisted. The development Vite origin is permitted only by a development web server. Set the desktop workspace URL to the deployed web origin before packaging. The configure command synchronizes its Tauri network CSP and URL-opening scope.

## Source files

- `src/App.tsx` — staff sign-in, enrollment and authorized navigation.
- `src/Register.tsx` — dedicated cashier register, checkout, hold/recall, calculator and receipt history.
- `src/CheckoutDialog.tsx` — confirm-sale and cash-payment steps.
- `src/CustomerDisplay.tsx`, `src/customer-display.ts` — private public-data projection, second-screen transport and customer presentation.
- `electron-shell/main.cjs`, `electron-shell/preload.cjs` — existing Electron development host with isolated customer display and allowlisted IPC.
- `src/dialogs.tsx` — accessible native HTML dialogs and receipt presentation.
- `src/api.ts` — authenticated Edge Function and enrollment clients.
- `src/domain.ts` — shared contracts, basket arithmetic and scan matching.
- `src/storage.ts` — per-account basket and transaction recovery.
- `src/config.ts` — designated project and publishable-key validation.
- `src/main.tsx`, `src/styles.css`, `public/golden-rose-logo.png` — application entry and existing branding.
- `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`, `src-tauri/build.rs`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/icons/` — Windows host, printing, scoped capabilities and installer setup.
- `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `playwright.config.ts`, `.gitignore`, `.env.example`, `index.html`, `scripts/configure.mjs` — independent tooling and environment setup.
- `tests/register.test.ts`, `tests/enrollment.test.ts`, `tests/browser/register.spec.ts` — isolated unit and browser verification.
- `tests/browser/fixtures.ts`, `tests/browser/electron.spec.ts`, `tests/browser/web-pos.spec.ts` — native display isolation and the actual web POS component mounted with isolated test actions. No test action route is added to the production application.

The repository's root TypeScript config excludes this independent Vite app. Its ESLint config excludes generated desktop files and applies browser-appropriate image rules. No hosted schema or Edge Function deployment is required for the register itself.
