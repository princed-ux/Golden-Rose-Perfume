# Customer dashboard foundation

`/account/dashboard` is a public, explicitly labelled frontend preview. Locally valid customer-login inputs open it without authentication, cookies, role changes or stored credentials. Staff-login behavior is unchanged.

The dashboard includes account overview, sample order cards and details, six-stage delivery tracking, removable/restorable local wishlist examples, profile/address empty states and clearly marked future account tools. Reorder, add-to-cart and address editing are disabled previews. Wishlist changes reset on navigation/reload. Existing product links retain their destinations.

`src/domain/customer.ts` defines profiles, addresses, orders/items, wishlist entries and tracking events, including cancelled/returned states. `src/lib/customer-data.ts` isolates fictional fixtures behind `CustomerDataSource`; values reuse existing product fixtures. Campaign images are illustrative rather than verified inventory photography. The reusable timeline lives in `src/components/order-tracking-timeline.tsx`.

Loading, retry/error, empty-order, empty-wishlist and empty-address states are implemented. Dates use explicit UTC formatting. Theme selection reuses the existing provider; dashboard effects remain scoped in `page.css`.

Before connecting real accounts, replace the preview source with authenticated server APIs, authorize every order/profile/wishlist/address request against the server session, validate responses and connect verified inventory, cart, carrier tracking and receipts. Never authorize from a browser-provided customer ID or role. Replace the preview redirect with a server-verified flow and protect customer routes. No backend, migrations or authentication integration was added in this phase.

Verification: production build and TypeScript pass; 21 existing/new tests pass. Chrome checked 320, 390, 768, 1024 and 1440px in light/dark, order selection, wishlist empty/restore, preview redirect, theme persistence and preserved primary routes. No horizontal overflow or runtime/hydration errors were observed. Data-source error/empty behavior and terminal tracking are covered by tests; live services remain unimplemented.
