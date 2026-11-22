
import Image from 'next/image';
import Link from 'next/link';

import {
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Flower2,
  Menu,
  Search,
  ShoppingBag,
  UserRound,
} from 'lucide-react';

import { ProductCard } from '@/src/components/product-card';
import type { CatalogProduct } from '@/src/lib/golden-rose/contracts';

import './page.css';

const BRAND_LOGO = '/assets/brand/golden-rose-logo.png';
const SHOP_EDITORIAL_PHOTO =
  '/assets/products/telegram-selected/gr-3bed367cf5c0.jpg';

interface ShopViewProps {
  items: CatalogProduct[] | null;
  unavailable?: boolean;
  query?: string;
  category?: string;
  sort?: string;
  page?: number;
  hasNext?: boolean;
  categories?: string[];
}

function shopLink({
  page = 1,
  query = '',
  category = '',
  sort = '',
}: {
  page?: number;
  query?: string;
  category?: string;
  sort?: string;
}): string {
  const parameters = new URLSearchParams();

  if (query) parameters.set('q', query);
  if (category) parameters.set('category', category);
  if (sort) parameters.set('sort', sort);
  if (page > 1) parameters.set('page', String(page));

  const search = parameters.toString();
  return search ? `/shop?${search}` : '/shop';
}

function ShopHeader({
  query,
  category,
  sort,
}: {
  query: string;
  category: string;
  sort: string;
}) {
  return (
    <>
      <div className="gr-shop__announcement">
        <span>GOLDEN ROSE PERFUME</span>
        <span className="gr-shop__announcement-star" aria-hidden="true">
          ✳
        </span>
        <span>THE BEAUTY OF FRAGRANCE</span>
      </div>

      <header className="gr-shop__header">
        <div className="gr-shop__header-inner">
          <Link
            className="gr-shop__brand"
            href="/"
            aria-label="Golden Rose Perfume homepage"
          >
            <span className="gr-shop__brand-mark">
              <Image
                src={BRAND_LOGO}
                alt=""
                width={1188}
                height={1324}
                sizes="64px"
                className="gr-shop__brand-image"
                preload
              />
            </span>

            <span className="gr-shop__brand-name">
              <strong>Golden Rose</strong>
              <small>PERFUME</small>
            </span>
          </Link>

          <nav className="gr-shop__main-nav" aria-label="Main navigation">
            <Link href="/">Discover</Link>
            <Link href="/shop" aria-current="page">
              Shop all
            </Link>
            <Link href="/#categories">Categories</Link>
            <Link href="/about">Our story</Link>
          </nav>

          <div className="gr-shop__header-actions">
            <form
              action="/shop"
              method="get"
              role="search"
              aria-label="Search the perfume catalogue"
              className="gr-shop__header-search"
            >
              <Search size={17} strokeWidth={1.7} aria-hidden="true" />
              <input
                type="search"
                name="q"
                aria-label="Search fragrances"
                defaultValue={query}
                placeholder="Search fragrances"
                maxLength={120}
              />
              {category && <input type="hidden" name="category" value={category} />}
              {sort && <input type="hidden" name="sort" value={sort} />}
            </form>

            <Link
              href="/account"
              className="gr-shop__header-icon"
              aria-label="Your account"
            >
              <UserRound size={20} aria-hidden="true" />
            </Link>

            <Link
              href="/cart"
              className="gr-shop__header-icon"
              aria-label="Shopping bag"
            >
              <ShoppingBag size={20} aria-hidden="true" />
            </Link>

            <details className="gr-shop__mobile-menu">
              <summary aria-label="Open navigation menu">
                <Menu size={23} aria-hidden="true" />
              </summary>
              <div className="gr-shop__mobile-panel">
                <nav aria-label="Mobile shop navigation">
                  <Link href="/">Discover</Link>
                  <Link href="/shop" aria-current="page">Shop all</Link>
                  <Link href="/#categories">Categories</Link>
                  <Link href="/#gallery">Photo diary</Link>
                  <Link href="/about">Our story</Link>
                  <Link href="/account">My account</Link>
                  <Link href="/cart">Shopping bag</Link>
                </nav>
                <form action="/shop" method="get" role="search">
                  <label htmlFor="gr-shop-mobile-search">Search the collection</label>
                  <div className="gr-shop__mobile-search">
                    <input
                      id="gr-shop-mobile-search"
                      type="search"
                      name="q"
                      defaultValue={query}
                      maxLength={120}
                      placeholder="Find a perfume…"
                    />
                    {category && <input type="hidden" name="category" value={category} />}
                    {sort && <input type="hidden" name="sort" value={sort} />}
                    <button type="submit" aria-label="Search perfumes">
                      <ArrowRight size={18} aria-hidden="true" />
                    </button>
                  </div>
                </form>
              </div>
            </details>
          </div>
        </div>
      </header>
    </>
  );
}

function ShopFooter() {
  return (
    <footer className="gr-shop__footer">
      <div className="gr-shop__footer-inner">
        <div className="gr-shop__footer-brand">
          <span className="gr-shop__footer-eyebrow">THE BEAUTY OF FRAGRANCE</span>
          <strong>Golden Rose <em>Perfume.</em></strong>
          <p>A fragrance for every mood, every moment, every story.</p>
        </div>
        <nav className="gr-shop__footer-nav" aria-label="Shop footer navigation">
          <Link href="/">Discover</Link>
          <Link href="/shop">Shop all</Link>
          <Link href="/about">Our story</Link>
          <Link href="/account">Your account</Link>
          <Link href="/cart">Shopping bag</Link>
        </nav>
      </div>
      <div className="gr-shop__footer-base">
        <span>GOLDEN ROSE PERFUME</span>
        <span>MADE FOR THE MOMENTS THAT STAY.</span>
      </div>
    </footer>
  );
}

export function ShopView({
  items,
  unavailable = false,
  query = '',
  category = '',
  sort = '',
  page = 1,
  hasNext = false,
  categories = [],
}: ShopViewProps) {
  const products = items ?? [];
  const filtered = Boolean(query || category || sort);
  const categoryOptions = Array.from(
    new Set([
      ...categories.filter(value => typeof value === 'string' && value.trim()),
      ...products.flatMap(product => product.category ? [product.category] : []),
      ...(category ? [category] : []),
    ]),
  ).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));

  const pageLink = (targetPage: number) => shopLink({
    page: targetPage,
    query,
    category,
    sort,
  });

  const showFilters = items !== null && !unavailable;

  return (
    <div className="gr-shop">
      <ShopHeader query={query} category={category} sort={sort} />

      <main id="main-content" className="gr-shop__main">
        <nav className="gr-shop__breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <ChevronRight size={13} aria-hidden="true" />
          <span aria-current="page">The collection</span>
        </nav>

        <section className="gr-shop__hero" aria-labelledby="gr-shop-heading">
          <div className="gr-shop__hero-copy">
            <p className="gr-shop__eyebrow">
              <span aria-hidden="true" />
              THE GOLDEN ROSE COLLECTION
            </p>
            <h1 id="gr-shop-heading">
              Find your <em>signature.</em>
            </h1>
            <p className="gr-shop__hero-description">
              A scent can say so much without a word. Explore fragrances
              for everyday rituals, unforgettable occasions and everything
              in between.
            </p>
            <div className="gr-shop__hero-actions">
              <a className="gr-shop__button gr-shop__button--primary" href="#shop-collection">
                Explore fragrances
                <ArrowUpRight size={18} aria-hidden="true" />
              </a>
              <Link className="gr-shop__text-link" href="/about">
                Our story
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
          <div className="gr-shop__hero-visual">
            <Image
              src={SHOP_EDITORIAL_PHOTO}
              alt="Golden Rose perfume collection editorial photography"
              fill
              sizes="(max-width: 900px) 100vw, 46vw"
              className="gr-shop__hero-image"
              preload
            />
            <div className="gr-shop__hero-photo-caption" aria-hidden="true">
              <span>GOLDEN ROSE PERFUME</span>
              <span>THE BEAUTY OF FRAGRANCE</span>
            </div>
          </div>
        </section>

        <section
          id="shop-collection"
          className="gr-shop__collection"
          aria-labelledby="gr-shop-collection-title"
        >
          <div className="gr-shop__collection-heading">
            <div>
              <p className="gr-shop__section-eyebrow">
                <Flower2 size={15} aria-hidden="true" />
                DISCOVER THE COLLECTION
              </p>
              <h2 id="gr-shop-collection-title">A fragrance for you.</h2>
              <p>
                Explore the published Golden Rose fragrances, with current
                product details and boutique pricing.
              </p>
            </div>
            <span className="gr-shop__collection-count" aria-live="polite">
              {items === null
                ? 'Loading collection'
                : unavailable
                  ? 'Collection unavailable'
                  : `${products.length} fragrance${products.length === 1 ? '' : 's'} on this page`}
            </span>
          </div>

          {showFilters && (
            <form
              action="/shop"
              method="get"
              role="search"
              aria-label="Search and filter fragrances"
              className="gr-shop__filters"
            >
              <label className="gr-shop__filter gr-shop__filter--search">
                <span>Search fragrances</span>
                <span className="gr-shop__filter-input-wrap">
                  <Search size={17} aria-hidden="true" />
                  <input
                    type="search"
                    name="q"
                    defaultValue={query}
                    maxLength={120}
                    placeholder="Search names and fragrances…"
                  />
                </span>
              </label>

              {categoryOptions.length > 0 && (
                <label className="gr-shop__filter">
                  <span>Category</span>
                  <select name="category" defaultValue={category}>
                    <option value="">All fragrances</option>
                    {categoryOptions.map(option => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="gr-shop__filter">
                <span>Sort by</span>
                <select name="sort" defaultValue={sort}>
                  <option value="">Name: A–Z</option>
                  <option value="price-low">Price: low to high</option>
                  <option value="price-high">Price: high to low</option>
                </select>
              </label>

              <button className="gr-shop__filter-apply" type="submit">
                Apply filters
                <ArrowRight size={17} aria-hidden="true" />
              </button>
              {filtered && (
                <Link href="/shop" className="gr-shop__clear-filters">
                  Clear filters
                </Link>
              )}
            </form>
          )}

          <div className="gr-shop__product-grid" aria-label="Fragrance products">
            {products.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}

            {products.length === 0 && (
              <div className="gr-shop__empty" role={unavailable ? 'alert' : 'status'}>
                <Flower2 size={36} strokeWidth={1.1} aria-hidden="true" />
                {unavailable ? (
                  <>
                    <h3>The collection is temporarily unavailable.</h3>
                    <p>Your bag and account remain safe. Please try again.</p>
                    <a href={pageLink(page)} className="gr-shop__button gr-shop__button--primary">
                      Try again <ArrowRight size={16} aria-hidden="true" />
                    </a>
                  </>
                ) : items === null ? (
                  <>
                    <h3>Preparing the collection…</h3>
                    <p>Checking the latest boutique fragrances.</p>
                  </>
                ) : filtered ? (
                  <>
                    <h3>No fragrances match those filters.</h3>
                    <p>Try a different category, search term or price order.</p>
                    <Link href="/shop" className="gr-shop__button gr-shop__button--primary">
                      View all fragrances <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  </>
                ) : (
                  <>
                    <h3>{page > 1 ? 'No fragrances on this page.' : 'The collection is coming soon.'}</h3>
                    <p>
                      Published fragrances will appear here when they are ready
                      for the Golden Rose boutique.
                    </p>
                    {page > 1 && (
                      <Link href={pageLink(page - 1)} className="gr-shop__button gr-shop__button--primary">
                        Previous page <ChevronLeft size={16} aria-hidden="true" />
                      </Link>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {(page > 1 || hasNext) && (
            <nav className="gr-shop__pagination" aria-label="Catalogue pages">
              {page > 1 ? (
                <Link href={pageLink(page - 1)} rel="prev">
                  <ChevronLeft size={17} aria-hidden="true" />
                  Previous
                </Link>
              ) : <span />}
              <span aria-current="page">Page {page}</span>
              {hasNext ? (
                <Link href={pageLink(page + 1)} rel="next">
                  Next
                  <ChevronRight size={17} aria-hidden="true" />
                </Link>
              ) : <span />}
            </nav>
          )}

          <div className="gr-shop__collection-outro">
            <p>A considered collection. A personal expression.</p>
            <Link href="/about">
              Discover the Golden Rose story
              <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <ShopFooter />
    </div>
  );
}
