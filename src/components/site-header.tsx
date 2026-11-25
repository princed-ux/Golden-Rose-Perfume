'use client';

import {
  Suspense,
  useEffect,
  useRef,
} from 'react';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  ArrowRight,
  Menu,
  Search,
  ShoppingBag,
  UserRound,
} from 'lucide-react';

import './site-header.css';

/* =========================================================
   GOLDEN ROSE PERFUME — SHARED STOREFRONT HEADER
   ========================================================= */

type NavItem = {
  href: string;
  label: string;
};

const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'Discover' },
  { href: '/shop', label: 'Shop all' },
  { href: '/#categories', label: 'Categories' },
  { href: '/about', label: 'Our story' },
  { href: '/faq', label: 'Help & FAQ' },
  { href: '/contact', label: 'Contact' },
];

/* =========================================================
   PUBLIC NAVIGATION

   Receive the pathname from the parent rather than
   independently accessing runtime URL information.

   A null pathname is valid during prerendering.
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
            Account
          </Link>

          <Link href="/cart">
            Shopping bag
          </Link>
        </>
      )}
    </nav>
  );
}

/* =========================================================
   HEADER PRESENTATION

   This component does not access Next.js runtime URL data.

   It can render as part of the static page shell while
   the route-aware header resolves the current pathname.
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

      {/* MAIN STOREFRONT HEADER */}

      <header className="gr-site-header">
        <div className="gr-site-header__inner">

          {/* BRAND IDENTITY */}

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

          {/* CUSTOMER ACTIONS */}

          <div className="gr-site-header__actions">

            {/* DESKTOP SEARCH */}

            <form
              action="/shop"
              method="get"
              className="gr-site-search"
              role="search"
              aria-label="Search fragrances"
            >
              <Search
                size={17}
                strokeWidth={1.7}
                aria-hidden="true"
              />

              <label
                htmlFor="gr-site-search"
                className="gr-site-sr-only"
              >
                Search fragrances
              </label>

              <input
                id="gr-site-search"
                type="search"
                name="q"
                maxLength={120}
                placeholder="Search fragrances"
              />
            </form>

            {/* CUSTOMER ACCOUNT */}

            <Link
              href="/account"
              className="gr-site-header__icon"
              aria-label="Your account"
            >
              <UserRound
                size={20}
                strokeWidth={1.6}
                aria-hidden="true"
              />
            </Link>

            {/* SHOPPING BAG */}

            <Link
              href="/cart"
              className="gr-site-header__icon"
              aria-label="Shopping bag"
            >
              <ShoppingBag
                size={20}
                strokeWidth={1.6}
                aria-hidden="true"
              />
            </Link>

            {/* MOBILE NAVIGATION */}

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

                <form
                  action="/shop"
                  method="get"
                  role="search"
                  aria-label="Mobile fragrance search"
                >
                  <label
                    htmlFor="gr-site-mobile-search"
                    className="gr-site-sr-only"
                  >
                    Search fragrances
                  </label>

                  <div className="gr-site-mobile__search">
                    <Search
                      size={17}
                      aria-hidden="true"
                    />

                    <input
                      id="gr-site-mobile-search"
                      type="search"
                      name="q"
                      maxLength={120}
                      placeholder="Search fragrances"
                    />

                    <button
                      type="submit"
                      aria-label="Submit search"
                    >
                      <ArrowRight
                        size={17}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                </form>

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

   usePathname() is called only inside the component
   protected by the Suspense boundary below.
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
   PUBLIC HEADER ENTRY POINT

   Compatible with Next.js Cache Components and
   dynamically generated routes such as /shop/[slug].

   The fallback preserves the actual header design,
   navigation links, logo, search and shopping bag.

   Only active-route highlighting waits for URL data.
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