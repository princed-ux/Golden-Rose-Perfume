import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';

import { canViewModule } from '@/src/domain/permissions';
import { requireStaff } from '@/src/lib/golden-rose/staff';
import { loadPosCatalogue } from './actions';
import { PosRegister } from './register';
import type { PosCatalogue } from './types';

import './pos.css';

export const metadata: Metadata = {
  title: 'Point of Sale | Golden Rose Perfume',
  description:
    'Secure in-store selling with barcode lookup, location-aware inventory, multiple payment methods and verified receipts.',
};

/**
 * Golden Rose POS route.
 *
 * Keep authorization and initial catalogue loading on the server.
 * The existing PosRegister owns transactions, stock checks,
 * barcode scanning, held baskets, modal checkout and receipts.
 *
 * These styles are local to the POS route. They allow the page
 * layout to be updated without replacing other application files.
 */

const routeStyles = String.raw`
/* ==========================================
   GOLDEN ROSE — COMPACT CASHIER WORKSPACE
========================================== */

.gr-pos-route {
  min-width: 0;
}

.gr-pos-route .pos-screen {
  padding-top: 4px;
}

/* Compact register heading */

.gr-pos-route .pos-heading {
  min-height: 38px !important;
  margin: 0 0 8px !important;
  gap: 8px 12px !important;
  align-items: center !important;
}

.gr-pos-route .pos-heading .pos-eyebrow,
.gr-pos-route .pos-heading > div:first-child > p:last-child,
.gr-pos-route .pos-heading-actions .pos-online {
  display: none !important;
}

.gr-pos-route .pos-heading h1 {
  margin: 0 !important;
  font-size: clamp(21px, 2vw, 26px) !important;
  line-height: 1.16 !important;
  letter-spacing: -.025em !important;
}

.gr-pos-route .pos-heading-actions {
  gap: 6px !important;
}

.gr-pos-route .pos-heading-actions .pos-secondary {
  min-height: 34px !important;
  padding: 6px 10px !important;
  border-radius: 7px !important;
  font-size: 11px !important;
}

.gr-pos-route .pos-heading-actions svg {
  width: 15px;
  height: 15px;
}

/* ==========================================
   SELLING LOCATION
   Hide redundant information when the
   only available store is already selected.
========================================== */

.gr-pos-route .gr-pos-single-store .pos-store-bar {
  display: none !important;
}

.gr-pos-route .pos-store-bar {
  min-height: 0 !important;
  padding: 6px 9px !important;
  margin: 0 0 8px !important;
  gap: 7px !important;
}

.gr-pos-route .pos-store-bar .pos-store-caption {
  display: none !important;
}

.gr-pos-route .pos-store-bar > label {
  font-size: 10px !important;
}

.gr-pos-route .pos-store-bar .pos-select select {
  min-width: 178px !important;
  width: auto !important;
  height: 34px !important;
  font-size: 11px !important;
}

.gr-pos-route .pos-store-bar .pos-select svg {
  top: 9px !important;
}

/* ==========================================
   CASHIER COLUMNS
========================================== */

.gr-pos-route .pos-columns {
  grid-template-columns:
    minmax(0, 1.55fr)
    minmax(345px, 1fr) !important;

  gap: 9px !important;
  align-items: stretch !important;
  min-height: 0 !important;
}

.gr-pos-route .pos-catalogue {
  display: flex !important;
  flex-direction: column !important;

  min-width: 0 !important;
  min-height: 0 !important;
  padding: 11px !important;
  overflow: hidden !important;
}

.gr-pos-route .pos-section-title {
  margin-bottom: 8px !important;
}

.gr-pos-route .pos-section-title .pos-eyebrow,
.gr-pos-route .pos-cart-heading .pos-eyebrow {
  display: none !important;
}

.gr-pos-route .pos-section-title h2,
.gr-pos-route .pos-cart-heading h2 {
  margin: 0 !important;
  font-size: 20px !important;
  line-height: 1.2 !important;
}

.gr-pos-route .pos-counter {
  padding: 5px 9px !important;
}

/* ==========================================
   PRODUCT SEARCH AND FILTERS
========================================== */

.gr-pos-route .pos-search {
  height: 42px !important;
}

.gr-pos-route .pos-refresh {
  min-height: 42px !important;
  width: 42px !important;
  flex-basis: 42px !important;
}

.gr-pos-route .pos-filter-row {
  margin: 8px 0 !important;
  gap: 8px !important;
}

.gr-pos-route .pos-segments button,
.gr-pos-route .pos-view-choices button {
  min-height: 30px !important;
}

.gr-pos-route .pos-catalogue-foot {
  font-size: 10px !important;
  margin-top: 6px !important;
}

/* ==========================================
   CLEAN, THIN SCROLLBARS
========================================== */

.gr-pos-route :is(
  .pos-product-table-wrap,
  .pos-products,
  .pos-cart-contents
) {
  scrollbar-width: thin;
  scrollbar-color: #c6b5ba transparent;
  overscroll-behavior: contain;
}

.gr-pos-route :is(
  .pos-product-table-wrap,
  .pos-products,
  .pos-cart-contents
)::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}

.gr-pos-route :is(
  .pos-product-table-wrap,
  .pos-products,
  .pos-cart-contents
)::-webkit-scrollbar-thumb {
  background: #c6b5ba;
  border-radius: 10px;
}

.gr-pos-route :is(
  .pos-product-table-wrap,
  .pos-products,
  .pos-cart-contents
)::-webkit-scrollbar-track {
  background: transparent;
}

.gr-pos-route :is(
  .pos-product-table-wrap,
  .pos-products,
  .pos-cart-contents
)::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}

/* ==========================================
   PRODUCT LIST
========================================== */

.gr-pos-route .pos-product-table-wrap,
.gr-pos-route .pos-products {
  min-height: 0 !important;
  overflow-y: auto !important;
}

.gr-pos-route .pos-product-table thead th {
  padding-top: 8px !important;
  padding-bottom: 8px !important;
}

.gr-pos-route .pos-product-table tbody td {
  height: 62px !important;
  padding-top: 7px !important;
  padding-bottom: 7px !important;
}

/* ==========================================
   CURRENT SALE BASKET
========================================== */

.gr-pos-route .pos-cart {
  display: flex !important;
  flex-direction: column !important;

  min-width: 0 !important;
  min-height: 0 !important;
  overflow: hidden !important;
}

.gr-pos-route .pos-cart-heading {
  min-height: 59px !important;
  padding: 10px 12px !important;
  flex: 0 0 auto;
}

.gr-pos-route .pos-basket-tools {
  flex: 0 0 auto;
  padding: 7px !important;
}

.gr-pos-route .pos-basket-tools button {
  min-height: 32px !important;
}

.gr-pos-route .pos-held-note {
  flex: 0 0 auto;
}

.gr-pos-route .pos-cart-contents {
  flex: 1 1 auto !important;

  min-height: 0 !important;
  max-height: none !important;

  overflow-x: hidden !important;
  overflow-y: auto !important;
}

/* ==========================================
   FIXED CHECKOUT FOOTER
========================================== */

.gr-pos-route .pos-checkout {
  flex: 0 0 auto !important;

  min-height: 0 !important;
  max-height: none !important;

  padding: 10px 13px !important;
  gap: 7px !important;
  overflow: visible !important;
}

.gr-pos-route .pos-amount-due {
  padding: 9px 0 5px !important;
}

.gr-pos-route .pos-amount-due strong {
  font-size: 21px !important;
}

.gr-pos-route .pos-pay {
  min-height: 48px !important;
}

.gr-pos-route .pos-register-shortcuts,
.gr-pos-route .pos-safe {
  font-size: 10px !important;
}

/* Prevent Amara from covering the cashier's
   Checkout button on the POS route. */

.owner-suite:has(.gr-pos-route)
.owner-amara-launch {
  display: none !important;
}

/* ==========================================
   FULL-SCREEN REGISTER VIEW
========================================== */

@media (min-width: 901px) {

  body:has(
    .gr-pos-route .pos-screen.pos-focus-mode
  ) {
    overflow: hidden;
  }

  .gr-pos-route .pos-screen.pos-focus-mode {
    position: fixed !important;
    inset: 0 !important;

    z-index: 10000 !important;

    display: flex !important;
    flex-direction: column !important;

    width: 100vw !important;
    height: 100dvh !important;

    min-height: 0 !important;
    max-width: none !important;

    padding: 7px 9px 9px !important;
    margin: 0 !important;

    overflow: hidden !important;
    background: #f8f5f4 !important;
  }

  .gr-pos-route
  .pos-screen.pos-focus-mode
  .pos-heading {
    flex: 0 0 auto !important;
  }

  .gr-pos-route
  .pos-screen.pos-focus-mode
  .pos-store-bar {
    flex: 0 0 auto !important;
  }

  .gr-pos-route
  .pos-screen.pos-focus-mode
  .pos-columns {
    display: grid !important;
    flex: 1 1 auto !important;

    grid-template-columns:
      minmax(0, 1.55fr)
      minmax(350px, 1fr) !important;

    height: auto !important;

    min-height: 0 !important;
    max-height: none !important;

    overflow: hidden !important;
  }

  .gr-pos-route
  .pos-screen.pos-focus-mode
  .pos-catalogue,

  .gr-pos-route
  .pos-screen.pos-focus-mode
  .pos-cart {
    height: 100% !important;

    min-height: 0 !important;
    max-height: none !important;

    overflow: hidden !important;
  }

  .gr-pos-route
  .pos-screen.pos-focus-mode
  .pos-product-table-wrap,

  .gr-pos-route
  .pos-screen.pos-focus-mode
  .pos-products {
    flex: 1 1 auto !important;

    max-height: none !important;
    min-height: 0 !important;

    overflow-y: auto !important;
  }

  .gr-pos-route
  .pos-screen.pos-focus-mode
  .pos-cart-contents {
    flex: 1 1 auto !important;

    max-height: none !important;
    min-height: 0 !important;

    overflow-y: auto !important;
  }

  .gr-pos-route
  .pos-screen.pos-focus-mode
  .pos-checkout {
    flex: 0 0 auto !important;
    max-height: none !important;
    overflow: visible !important;
  }

  .owner-suite:has(
    .gr-pos-route .pos-screen.pos-focus-mode
  ) {
    grid-template-columns:
      minmax(0, 1fr) !important;
  }

  .owner-suite:has(
    .gr-pos-route .pos-screen.pos-focus-mode
  ) > .owner-sidebar,

  .owner-suite:has(
    .gr-pos-route .pos-screen.pos-focus-mode
  ) .owner-topbar {
    display: none !important;
  }
}

/* ==========================================
   SMALLER DESKTOPS
========================================== */

@media (min-width: 901px) and (max-width: 1190px) {

  .gr-pos-route .pos-columns,

  .gr-pos-route
  .pos-screen.pos-focus-mode
  .pos-columns {
    grid-template-columns:
      minmax(0, 1.2fr)
      minmax(320px, 1fr) !important;
  }
}

/* ==========================================
   TABLETS
========================================== */

@media (max-width: 900px) {

  .gr-pos-route .pos-heading {
    align-items: flex-start !important;
  }

  .gr-pos-route .pos-columns {
    display: block !important;
  }

  .gr-pos-route .pos-catalogue {
    min-height: 380px !important;
  }

  .gr-pos-route .pos-cart {
    min-height: 0 !important;
  }
}

/* ==========================================
   MOBILE REGISTER
========================================== */

@media (max-width: 780px) {

  .gr-pos-route
  .pos-cart:not(.pos-cart-open) {
    display: none !important;
  }

  .gr-pos-route
  .pos-cart.pos-cart-open {
    position: fixed !important;

    top: 8px !important;
    right: 8px !important;
    bottom: 74px !important;
    left: 8px !important;

    z-index: 10500 !important;

    display: flex !important;

    height: auto !important;
    max-height: none !important;
  }

  .gr-pos-route .pos-mobile-cart-button {
    display: flex !important;
  }

  .gr-pos-route .pos-heading h1 {
    font-size: 22px !important;
  }

  .gr-pos-route
  .pos-heading-actions
  .pos-secondary {
    min-height: 31px !important;
    padding: 5px 7px !important;
  }

  .gr-pos-route .pos-product-table-wrap {
    max-height: 55dvh !important;
  }

  .gr-pos-route .pos-products {
    max-height: 55dvh !important;
  }
}

/* ==========================================
   ACCESSIBILITY
========================================== */

@media (prefers-reduced-motion: reduce) {

  .gr-pos-route *,
  .gr-pos-route *::before,
  .gr-pos-route *::after {
    scroll-behavior: auto !important;
  }
}
`;

/**
 * Accessible loading state while staff authorization
 * and the initial catalogue are being resolved.
 */

function LoadingRegister() {
  return (
    <div
      className="gr-pos-route"
      role="status"
      aria-live="polite"
    >
      <p className="p-5 text-sm text-gr-muted">
        Loading secure register…
      </p>
    </div>
  );
}

/**
 * Server route entry point.
 *
 * The existing register is responsible for client-side
 * interactions. Authorization is not moved to the browser.
 */

export default function PointOfSalePage() {
  return (
    <div className="gr-pos-route">
      <style id="gr-pos-route-styles">
        {routeStyles}
      </style>

      <Suspense fallback={<LoadingRegister />}>
        <AuthorizedRegister />
      </Suspense>
    </div>
  );
}

/**
 * Authorize the member of staff and obtain the initial
 * catalogue using the existing server-side implementation.
 */

async function AuthorizedRegister() {
  const {
    role,
    userId,
  } = await requireStaff();

  if (!canViewModule(role, 'pos')) {
    notFound();
  }

  let initial: PosCatalogue = {
    items: [],
    locations: [],
    selectedLocationId: null,
    hasMore: false,
    receivingAccount: null,
  };

  let loadError: string | null = null;

  try {
    initial = await loadPosCatalogue();
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : 'The register is unavailable. Please try again.';
  }

  /**
   * One-store configuration:
   *
   * The backend already knows the selected location.
   * Hide the redundant location bar only when that
   * single store is correctly selected.
   *
   * Multiple or unselected locations retain their
   * visible selector to protect stock accuracy.
   */

  const selectedSingleStore =
    initial.locations.length === 1 &&
    initial.selectedLocationId ===
      initial.locations[0]?.id;

  return (
    <div
      className={
        selectedSingleStore
          ? 'gr-pos-single-store'
          : undefined
      }
    >
      <PosRegister
        key={userId}
        initial={initial}
        loadError={loadError}
        role={role}
        staffId={userId}
      />
    </div>
  );
}