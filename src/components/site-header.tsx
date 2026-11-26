'use client';

import {
  Suspense,
  useEffect,
  useRef,
} from 'react';

import Image from 'next/image';
import Link from 'next/link';

import {
  usePathname,
} from 'next/navigation';

import {
  ArrowRight,
  Menu,
  Search,
  ShoppingBag,
  UserRound,
} from 'lucide-react';

import './site-header.css';

import './account-access.css';

/* =========================================================
   GOLDEN ROSE PERFUME — SHARED STOREFRONT HEADER
   ========================================================= */

type NavItem = {
  href: string;
  label: string;
};

const NAV_ITEMS: readonly NavItem[] = [
  {
    href: '/',
    label: 'Discover',
  },

  {
    href: '/shop',
    label: 'Shop all',
  },

  {
    href: '/#categories',
    label: 'Categories',
  },

  {
    href: '/about',
    label: 'Our story',
  },

  {
    href: '/faq',
    label: 'Help & FAQ',
  },

  {
    href: '/contact',
    label: 'Contact',
  },
];

/* =========================================================
   PUBLIC NAVIGATION
   ========================================================= */

function PublicNavigation({
  mobile = false,
  pathname,
}: {
  mobile?: boolean;
  pathname: string | null;
}) {
  return (
    <nav
      aria-label={
        mobile
          ? 'Mobile customer navigation'
          : 'Customer site navigation'
      }
      className={
        mobile
          ? 'gr-site-mobile__links'
          : 'gr-site-nav'
      }
    >
      {NAV_ITEMS.map(({ href, label }) => {
        const active =
          pathname !== null &&
          (
            href === '/'
              ? pathname === '/'

              : href.startsWith('/#')
                ? false

                : pathname === href ||
                  (
                    href === '/shop' &&
                    pathname.startsWith('/shop/')
                  )
          );

        return (
          <Link
            key={href}
            href={href}
            aria-current={
              active
                ? 'page'
                : undefined
            }
          >
            {label}
          </Link>
        );
      })}

      {mobile && (
        <>
          <Link href="/account">
            My account
          </Link>

          <Link href="/cart">
            Shopping bag
          </Link>

          <div className="gr-site-mobile__account-actions">
            <Link href="/account/login">
              Sign in
            </Link>

            <Link href="/account/register">
              Create account
            </Link>
          </div>

          <Link
            href="/staff/login"
            className="gr-site-mobile__staff-link"
          >
            Staff login
          </Link>
        </>
      )}
    </nav>
  );
}

/* =========================================================
   SHARED STOREFRONT SEARCH
   ========================================================= */

function FragranceSearch({
  menu = false,
}: {
  menu?: boolean;
}) {
  const inputId = menu
    ? 'gr-site-mobile-search'
    : 'gr-site-search';

  return (
    <form
      action="/shop"
      method="get"
      className={
        menu
          ? 'gr-site-mobile__search'
          : 'gr-site-search'
      }
      role="search"
      aria-label={
        menu
          ? 'Search from the navigation menu'
          : 'Search fragrances'
      }
    >
      <Search
        size={17}
        strokeWidth={1.7}
        aria-hidden="true"
      />

      <label
        htmlFor={inputId}
        className="gr-site-sr-only"
      >
        Search fragrances
      </label>

      <input
        id={inputId}
        type="search"
        name="q"
        maxLength={120}
        autoComplete="off"
        placeholder="Search fragrances"
      />

      <button
        type="submit"
        aria-label="Submit fragrance search"
      >
        <ArrowRight
          size={17}
          aria-hidden="true"
        />
      </button>
    </form>
  );
}

/* =========================================================
   HEADER PRESENTATION
   ========================================================= */

function SiteHeaderContent({
  pathname,
}: {
  pathname: string | null;
}) {
  const mobileMenuRef =
    useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (mobileMenuRef.current) {
      mobileMenuRef.current.open = false;
    }
  }, [pathname]);

  return (
    <>
      {/* BRAND ANNOUNCEMENT */}

      <div className="gr-site-announcement">
        <span>
          GOLDEN ROSE PERFUME
        </span>

        <span
          className="gr-site-announcement__star"
          aria-hidden="true"
        >
          ✳
        </span>

        <span>
          THE BEAUTY OF FRAGRANCE
        </span>
      </div>

      {/* MAIN HEADER */}

      <header className="gr-site-header">
        <div className="gr-site-header__inner">

          {/* EXISTING BRAND IDENTITY */}

          <Link
            href="/"
            className="gr-site-brand"
            aria-label="Golden Rose Perfume homepage"
          >
            <span className="gr-site-brand__mark">
              <Image
                src="/assets/brand/golden-rose-logo.png"
                alt=""
                width={1188}
                height={1324}
                sizes="64px"
                className="gr-site-brand__image"
              />
            </span>

            <span className="gr-site-brand__name">
              <strong>
                Golden Rose
              </strong>

              <small>
                PERFUME
              </small>
            </span>
          </Link>

          {/* DESKTOP NAVIGATION */}

          <PublicNavigation
            pathname={pathname}
          />

          {/* ACCOUNT AND SHOPPING ACTIONS */}

          <div className="gr-site-header__actions">

            {/* SEARCH REMAINS VISIBLE ON MOBILE */}

            <FragranceSearch />

            {/* CUSTOMER ACCOUNT */}

            <Link
              href="/account"
              className="gr-site-header__icon gr-site-header__account"
              aria-label="Your account, sign in or register"
              aria-current={
                pathname === '/account' ||
                pathname?.startsWith('/account/')
                  ? 'page'
                  : undefined
              }
            >
              <UserRound
                size={20}
                strokeWidth={1.6}
                aria-hidden="true"
              />

              <span>Account</span>
            </Link>

            {/* SHOPPING BAG */}

            <Link
              href="/cart"
              className="gr-site-header__icon gr-site-header__bag"
              aria-label="Shopping bag"
            >
              <ShoppingBag
                size={20}
                strokeWidth={1.6}
                aria-hidden="true"
              />
            </Link>

            {/* MOBILE MENU */}

            <details
              className="gr-site-mobile"
              ref={mobileMenuRef}
            >
              <summary
                aria-label="Open navigation menu"
              >
                <Menu
                  size={23}
                  aria-hidden="true"
                />
              </summary>

              <div className="gr-site-mobile__panel">

                <FragranceSearch menu />

                <PublicNavigation
                  mobile
                  pathname={pathname}
                />
              </div>
            </details>
          </div>
        </div>
      </header>
    </>
  );
}

/* =========================================================
   RUNTIME-AWARE HEADER

   Preserve the Suspense boundary for Next.js
   Cache Components and prerendered routes.
   ========================================================= */

function RouteAwareSiteHeader() {
  const pathname = usePathname();

  return (
    <SiteHeaderContent
      pathname={pathname}
    />
  );
}

/* =========================================================
   PUBLIC HEADER ENTRY
   ========================================================= */

export function SiteHeader() {
  return (
    <Suspense
      fallback={
        <SiteHeaderContent
          pathname={null}
        />
      }
    >
      <RouteAwareSiteHeader />
    </Suspense>
  );
}