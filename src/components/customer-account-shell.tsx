import type { ReactNode } from 'react';

import Image from 'next/image';
import Link from 'next/link';

import {
  ArrowRight,
  Heart,
  House,
  Package,
  Search,
  Settings2,
  ShoppingBag,
} from 'lucide-react';

import '@/app/account/dashboard/page.css';

import './account-access.css';

/* =========================================================
   GOLDEN ROSE — CUSTOMER ACCOUNT NAVIGATION
   ========================================================= */

const navigation = [
  {
    id: 'overview',
    label: 'Overview',
    href: '/account/dashboard',
    Icon: House,
  },

  {
    id: 'shop',
    label: 'Explore Perfumes',
    href: '/shop',
    Icon: Search,
  },

  {
    id: 'bag',
    label: 'My Bag',
    href: '/cart',
    Icon: ShoppingBag,
  },

  {
    id: 'wishlist',
    label: 'Saved Fragrances',
    href: '/account/wishlist',
    Icon: Heart,
  },

  {
    id: 'orders',
    label: 'My Orders',
    href: '/account/orders',
    Icon: Package,
  },

  {
    id: 'settings',
    label: 'Account Settings',
    href: '/account/settings',
    Icon: Settings2,
  },
] as const;

interface CustomerAccountShellProps {
  active: (typeof navigation)[number]['id'];

  name?: string;

  children: ReactNode;
}

/* =========================================================
   FRAGRANCE SEARCH

   Uses the existing live catalogue search endpoint.
   No sample or placeholder products are introduced.
   ========================================================= */

function AccountSearch({
  mobile = false,
}: {
  mobile?: boolean;
}) {
  const inputId = mobile
    ? 'grc-mobile-fragrance-search'
    : 'grc-desktop-fragrance-search';

  return (
    <form
      action="/shop"
      method="get"
      role="search"
      aria-label="Search fragrances"
      className={
        'grc-account-search ' +
        (
          mobile
            ? 'grc-account-search--mobile'
            : 'grc-account-search--desktop'
        )
      }
    >
      <Search
        size={19}
        strokeWidth={1.6}
        aria-hidden="true"
      />

      <label
        htmlFor={inputId}
        className="gr-access-sr-only"
      >
        Search fragrances
      </label>

      <input
        id={inputId}
        type="search"
        name="q"
        maxLength={120}
        placeholder="Search fragrances..."
        autoComplete="off"
      />

      <button
        type="submit"
        aria-label="Search the catalogue"
      >
        <ArrowRight
          size={18}
          aria-hidden="true"
        />
      </button>
    </form>
  );
}

/* =========================================================
   SHARED CUSTOMER WORKSPACE
   ========================================================= */

export function CustomerAccountShell({
  active,
  name,
  children,
}: CustomerAccountShellProps) {
  const firstLetter =
    name?.trim().charAt(0).toUpperCase() ||
    'G';

  return (
    <div className="grc-shell">

      <a
        href="#customer-content"
        className="gr-access-skip"
      >
        Skip to account content
      </a>

      <div className="grc-layout">

        {/* CUSTOMER SIDEBAR */}

        <aside className="grc-sidebar">
          <div className="grc-sidebar__content">

            <Link
              href="/"
              className="grc-brand"
              aria-label="Golden Rose Perfume homepage"
            >
              <span className="grc-brand__logo">
                <Image
                  src="/assets/brand/golden-rose-logo.png"
                  alt=""
                  width={54}
                  height={60}
                  className="grc-brand__image"
                />
              </span>

              <span className="grc-brand__name">
                GOLDEN ROSE

                <small>
                  BEAUTY OF FRAGRANCE
                </small>
              </span>
            </Link>

            {/* MOBILE SEARCH ABOVE ACCOUNT NAVIGATION */}

            <AccountSearch mobile />

            <div className="grc-sidebar__heading">
              <h2>My Account</h2>
            </div>

            <nav
              className="grc-sidebar__navigation"
              aria-label="Customer account navigation"
            >
              {navigation.map(
                ({
                  id,
                  label,
                  href,
                  Icon,
                }) => (
                  <Link
                    key={id}
                    href={href}
                    className="grc-nav-item"
                    aria-current={
                      active === id
                        ? 'page'
                        : undefined
                    }
                  >
                    <Icon
                      size={18}
                      strokeWidth={1.55}
                      aria-hidden="true"
                    />

                    <span>{label}</span>
                  </Link>
                ),
              )}
            </nav>
          </div>

          <div
            className="grc-sidebar__rose"
            aria-hidden="true"
          />

          <div className="grc-sidebar__footer">
            <span>GOLDEN ROSE</span>

            <small>
              Every scent tells a story.
            </small>
          </div>
        </aside>

        {/* MAIN CUSTOMER CONTENT */}

        <div className="grc-main-column">

          {/* ACCOUNT TOPBAR */}

          <header className="grc-topbar">
            <div className="grc-topbar__inner">

              {/* DESKTOP CATALOGUE SEARCH */}

              <AccountSearch />

              <nav
                className="grc-topbar__navigation"
                aria-label="Store navigation"
              >
                <Link href="/shop">
                  Explore Perfumes
                </Link>

                <Link
                  href="/cart"
                  className="grc-topbar__bag"
                >
                  <ShoppingBag
                    size={18}
                    strokeWidth={1.6}
                    aria-hidden="true"
                  />

                  <span>My Bag</span>
                </Link>

                <Link
                  href="/account/settings"
                  className="grc-topbar__avatar"
                  aria-label="Account Settings"
                >
                  <span>{firstLetter}</span>
                </Link>
              </nav>
            </div>
          </header>

          {/* EXISTING PAGE CONTENT */}

          <main
            id="customer-content"
            className="grc-content"
            tabIndex={-1}
          >
            {children}
          </main>

          {/* FOOTER */}

          <footer className="grc-footer">
            <span>
              © {new Date().getFullYear()}
              {' '}Golden Rose Perfume
            </span>

            <span>
              Beauty of Fragrance
            </span>
          </footer>
        </div>
      </div>
    </div>
  );
}