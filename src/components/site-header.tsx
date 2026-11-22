
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  Menu,
  Search,
  ShoppingBag,
  UserRound,
} from 'lucide-react';

import './site-header.css';

/**
 * Customer-facing header shared by product details, cart, checkout,
 * Contact and FAQ pages. Search submits directly to the published shop.
 */
export function SiteHeader() {
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

          <nav className="gr-site-nav" aria-label="Customer site navigation">
            <Link href="/">Discover</Link>
            <Link href="/shop">Shop all</Link>
            <Link href="/#categories">Categories</Link>
            <Link href="/about">Our story</Link>
            <Link href="/faq">Help &amp; FAQ</Link>
          </nav>

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

            <details className="gr-site-mobile">
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
                <nav aria-label="Mobile customer navigation">
                  <Link href="/">Discover</Link>
                  <Link href="/shop">Shop all</Link>
                  <Link href="/#categories">Categories</Link>
                  <Link href="/#gallery">Photo diary</Link>
                  <Link href="/about">Our story</Link>
                  <Link href="/faq">Help &amp; FAQ</Link>
                  <Link href="/contact">Contact us</Link>
                  <Link href="/account">Account</Link>
                  <Link href="/cart">Shopping bag</Link>
                </nav>
              </div>
            </details>
          </div>
        </div>
      </header>
    </>
  );
}
