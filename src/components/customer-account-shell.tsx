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

const navigation = [
  {
    id: 'overview',
    label: 'Overview',
    mobileLabel: 'Home',
    href: '/account/dashboard',
    Icon: House,
  },
  {
    id: 'shop',
    label: 'Explore Perfumes',
    mobileLabel: 'Perfumes',
    href: '/account/shop',
    Icon: Search,
  },
  {
    id: 'bag',
    label: 'My Bag',
    mobileLabel: 'My Bag',
    href: '/account/shop?view=bag',
    Icon: ShoppingBag,
  },
  {
    id: 'wishlist',
    label: 'Saved Fragrances',
    mobileLabel: 'Saved',
    href: '/account/wishlist',
    Icon: Heart,
  },
  {
    id: 'orders',
    label: 'My Orders',
    mobileLabel: 'Orders',
    href: '/account/orders',
    Icon: Package,
  },
  {
    id: 'settings',
    label: 'Account Settings',
    mobileLabel: 'Settings',
    href: '/account/settings',
    Icon: Settings2,
  },
] as const;

type AccountSection =
  (typeof navigation)[number]['id'];

interface CustomerAccountShellProps {
  active: AccountSection;
  name?: string;
  children: ReactNode;
}

function Brand() {
  return (
    <Link
      href="/account/dashboard"
      className="grc-brand"
      aria-label="Golden Rose customer dashboard"
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
        <small>BEAUTY OF FRAGRANCE</small>
      </span>
    </Link>
  );
}

function AccountSearch() {
  return (
    <form
      action="/account/shop"
      method="get"
      role="search"
      aria-label="Search fragrances in your account"
      className="grc-account-search w-full! lg:max-w-[420px]"
    >
      <Search
        size={19}
        strokeWidth={1.6}
        aria-hidden="true"
      />

      <label
        htmlFor="grc-fragrance-search"
        className="gr-access-sr-only"
      >
        Search fragrances
      </label>

      <input
        id="grc-fragrance-search"
        name="q"
        type="search"
        maxLength={120}
        placeholder="Search fragrances..."
        autoComplete="off"
      />

      <button
        type="submit"
        aria-label="Search fragrances"
      >
        <ArrowRight
          size={18}
          aria-hidden="true"
        />
      </button>
    </form>
  );
}

function MobileNavigation({
  active,
}: {
  active: AccountSection;
}) {
  return (
    <nav
      aria-label="Mobile customer account navigation"
      className="
        grid grid-cols-3 gap-1.5
        border-t border-[var(--gr-theme-border)]
        px-3 py-3
        sm:grid-cols-6 sm:gap-2
        lg:hidden
      "
    >
      {navigation.map(({
        id,
        mobileLabel,
        href,
        Icon,
      }) => (
        <Link
          key={id}
          href={href}
          aria-current={
            active === id ? 'page' : undefined
          }
          className={
            'flex min-h-14 min-w-0 flex-col items-center ' +
            'justify-center gap-1.5 rounded-lg border px-1 py-2 ' +
            'text-center text-[11px] font-semibold leading-tight ' +
            (
              active === id
                ? 'border-[var(--gr-theme-gold)] bg-[var(--gr-theme-surface-alt)] text-[var(--gr-theme-gold)]!'
                : 'border-transparent text-[var(--gr-theme-text)] hover:bg-[var(--gr-theme-surface-alt)]'
            )
          }
        >
          <Icon
            size={19}
            strokeWidth={1.65}
            aria-hidden="true"
            className="shrink-0"
          />

          <span className="break-words">
            {mobileLabel}
          </span>
        </Link>
      ))}
    </nav>
  );
}

export function CustomerAccountShell({
  active,
  name,
  children,
}: CustomerAccountShellProps) {
  const firstLetter =
    name?.trim().charAt(0).toUpperCase() || 'G';

  return (
    <div className="grc-shell">

      <a
        href="#customer-content"
        className="gr-access-skip"
      >
        Skip to account content
      </a>

      <div className="grc-layout">

        {/* DESKTOP SIDEBAR ONLY */}

        <aside className="grc-sidebar hidden! lg:flex!">
          <div className="grc-sidebar__content">
            <Brand />

            <div className="grc-sidebar__heading">
              <h2>My Account</h2>
            </div>

            <nav
              className="grc-sidebar__navigation"
              aria-label="Customer account navigation"
            >
              {navigation.map(({
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
              ))}
            </nav>
          </div>

          <div
            className="grc-sidebar__rose"
            aria-hidden="true"
          />

          <div className="grc-sidebar__footer">
            <span>GOLDEN ROSE</span>
            <small>Every scent tells a story.</small>
          </div>
        </aside>

        {/* CUSTOMER ACCOUNT CONTENT */}

        <div className="grc-main-column">

          <header className="grc-topbar max-lg:static!">

            {/* MOBILE BRAND AND ACCOUNT */}

            <div className="flex min-w-0 items-center justify-between gap-3 px-4 pt-3 lg:hidden">
              <Brand />

              <Link
                href="/account/settings"
                className="grc-topbar__avatar shrink-0"
                aria-label="Account settings"
              >
                <span>{firstLetter}</span>
              </Link>
            </div>

            {/* SEARCH AND DESKTOP SHORTCUTS */}

            <div className="flex min-w-0 flex-wrap items-center gap-4 px-4 py-3 lg:min-h-[78px] lg:flex-nowrap lg:px-8">
              <AccountSearch />

              <nav
                className="ml-auto hidden shrink-0 items-center gap-5 lg:flex"
                aria-label="Customer shopping shortcuts"
              >
                <Link
                  href="/account/shop"
                  className="inline-flex min-h-11 items-center text-sm font-semibold"
                >
                  Explore Perfumes
                </Link>

                <Link
                  href="/account/shop?view=bag"
                  className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold"
                >
                  <ShoppingBag
                    size={19}
                    aria-hidden="true"
                  />

                  My Bag
                </Link>

                <Link
                  href="/account/settings"
                  className="grc-topbar__avatar"
                  aria-label="Account settings"
                >
                  <span>{firstLetter}</span>
                </Link>
              </nav>
            </div>

            {/* VISIBLE MOBILE NAVIGATION */}

            <MobileNavigation active={active} />
          </header>

          {/* PAGE CONTENT */}

          <main
            id="customer-content"
            className="grc-content min-w-0"
            tabIndex={-1}
          >
            {children}
          </main>

          <footer className="grc-footer">
            <span>
              © {new Date().getFullYear()} Golden Rose Perfume
            </span>

            <span>Beauty of Fragrance</span>
          </footer>
        </div>
      </div>
    </div>
  );
}