# Frontend theme foundation

## Hydration diagnosis and correction

The actual rendering defect was in `WorkspaceOverview`, in `app/workspace/page.tsx`: SVG point tooltips used `<title>{point.day}: {money(point.revenue)} — demo</title>`. React's development log reported a `<title>` children array of length four. The title now receives a single template-string child. No hydration warnings were suppressed.

After the correction, an isolated Chrome production-browser run checked the homepage, customer login, customer registration, staff login and workspace with light and dark preferences. No runtime/console hydration errors were captured across those five pages. The original preview host failure is separate: its tool kernel cannot write its runtime assets. The existing dev server also blocks HMR requests from `127.0.0.1`; its advertised `localhost` address avoids that origin mismatch. No production or backend configuration was changed.

## Theme behavior

`src/components/theme-provider.tsx` wraps existing page content and provides an accessible, keyboard-operable native Appearance selector. Choices are Light, Dark and System. The preference is persisted under `golden-rose-theme` in localStorage and synchronized across tabs. Storage access failures safely fall back to System. CSS media queries handle live OS preference changes.

The server and initial client render both use System. A saved override is restored after mounting, so hydration does not depend on localStorage, browser media queries, clock values or random data during render. No `suppressHydrationWarning` was introduced. A stored override may briefly follow the system palette before mounting.

Global CSS contains shared color tokens and the small shared Appearance control. Homepage, authentication and workspace theme colors remain in their respective `page.css` files. Existing shared shop/module surfaces map to the same tokens in `starter.css`. Black-and-gold navigation, campaign photography and existing layouts are preserved.

## Files

- `app/layout.tsx`
- `app/globals.css`
- `app/starter.css`
- `app/page.css`
- `app/account/page.css`
- `app/staff/page.css`
- `app/workspace/page.css`
- `app/workspace/page.tsx`
- `src/components/theme-provider.tsx`
- `src/components/theme-provider.test.ts`
- `docs/THEME_FOUNDATION.md`

## Verification

Browser checks passed for light/dark switching on all five main screens, persisted selection after a fresh navigation, and live dark/light system-preference emulation. Screenshots were visually inspected. The initial build and existing/new tests passed; final build/test results are recorded in the completion report.

No authentication, database, payment or other backend behavior was implemented. No dependencies were installed, commits created, or changes pushed.

Final verification: npm run build passed (exit 0), all 15 retained tests passed, and git diff --check passed. Production browser checks recorded zero runtime/hydration errors on the five main screens.
