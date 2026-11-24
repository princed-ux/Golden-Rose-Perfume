'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, Menu, Search, ShoppingBag, UserRound } from 'lucide-react';

import './site-header.css';

type NavItem = { href: string; label: string };

/** Single source of truth for the public website's main navigation. */
const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'Discover' },
  { href: '/shop', label: 'Shop all' },
  { href: '/#categories', label: 'Categories' },
  { href: '/about', label: 'Our story' },
  { href: '/faq', label: 'Help & FAQ' },
  { href: '/contact', label: 'Contact' },
];

function PublicNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={mobile ? 'Mobile customer navigation' : 'Customer site navigation'}
      className={mobile ? 'gr-site-mobile__links' : 'gr-site-nav'}
    >
      {NAV_ITEMS.map(({ href, label }) => {
        const active =
          href === '/' ? pathname === '/' :
          href.startsWith('/#') ? false :
          pathname === href || (href === '/shop' && pathname.startsWith('/shop/'));

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
          >
            {label}
          </Link>
        );
      })}
      {mobile && (
        <>
          <Link href="/account">Account</Link>
          <Link href="/cart">Shopping bag</Link>
        </>
      )}
    </nav>
  );
}

/**
 * Reusable storefront header. Never include page-specific promotional copy here.
 * Home, Shop, About, FAQ, Contact, Cart, Checkout and product details share it.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const mobileMenuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (mobileMenuRef.current) mobileMenuRef.current.open = false;
  }, [pathname]);

  return (
    <>
      <div className="gr-site-announcement">
        <span>GOLDEN ROSE PERFUME</span>
        <span className="gr-site-announcement__star" aria-hidden="true">✳</span>
        <span>THE BEAUTY OF FRAGRANCE</span>
      </div>

      <header className="gr-site-header">
        <div className="gr-site-header__inner">
          <Link href="/" className="gr-site-brand" aria-label="Golden Rose Perfume homepage">
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
              <strong>Golden Rose</strong>
              <small>PERFUME</small>
            </span>
          </Link>

          <PublicNavigation />

          <div className="gr-site-header__actions">
            <form action="/shop" method="get" className="gr-site-search" role="search" aria-label="Search fragrances">
              <Search size={17} strokeWidth={1.7} aria-hidden="true" />
              <label htmlFor="gr-site-search" className="gr-site-sr-only">Search fragrances</label>
              <input id="gr-site-search" type="search" name="q" maxLength={120} placeholder="Search fragrances" />
            </form>

            <Link href="/account" className="gr-site-header__icon" aria-label="Your account">
              <UserRound size={20} strokeWidth={1.6} aria-hidden="true" />
            </Link>
            <Link href="/cart" className="gr-site-header__icon" aria-label="Shopping bag">
              <ShoppingBag size={20} strokeWidth={1.6} aria-hidden="true" />
            </Link>

            <details className="gr-site-mobile" ref={mobileMenuRef}>
              <summary aria-label="Open navigation menu">
                <Menu size={23} aria-hidden="true" />
              </summary>
              <div className="gr-site-mobile__panel">
                <form action="/shop" method="get" role="search" aria-label="Mobile fragrance search">
                  <label htmlFor="gr-site-mobile-search" className="gr-site-sr-only">Search fragrances</label>
                  <div className="gr-site-mobile__search">
                    <Search size={17} aria-hidden="true" />
                    <input id="gr-site-mobile-search" type="search" name="q" maxLength={120} placeholder="Search fragrances" />
                    <button type="submit" aria-label="Submit search">
                      <ArrowRight size={17} aria-hidden="true" />
                    </button>
                  </div>
                </form>
                <PublicNavigation mobile />
              </div>
            </details>
          </div>
        </div>
      </header>
    </>
  );
}