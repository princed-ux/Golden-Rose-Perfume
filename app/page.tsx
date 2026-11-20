
import './page.css';

import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDown,
  Flower2,
  Heart,
  Menu,
  MessageCircle,
  Search,
  ShoppingBag,
  UserRound,
} from 'lucide-react';

import HeroSlideshow from './HeroSlideshow';
import HomeRail from './HomeRail';

import {
  catalogPages,
  getCatalogPage,
} from '@/src/lib/golden-rose/edge';

import {
  formatPrice,
  type CatalogProduct,
  type CatalogVariant,
} from '@/src/lib/golden-rose/contracts';

import { ProductPhoto } from '@/src/components/product-photo';
import { getWhatsAppNumber } from '@/src/lib/customer/bag';

/*
 * GOLDEN ROSE — REAL PHOTOGRAPHS
 *
 * Change these filenames to use another imported image.
 * These are editorial photographs, not assignments to
 * specific catalogue products or prices.
 */

const MEDIA = '/assets/products/telegram-selected';

const photos = {
  lead: `${MEDIA}/gr-3bed367cf5c0.jpg`,
  side: `${MEDIA}/gr-456e486c1d89.jpg`,
  detail: `${MEDIA}/gr-e0a11f5027ba.jpg`,
  story: `${MEDIA}/gr-0d2af9e22ba4.jpg`,
  ending: `${MEDIA}/gr-931bd506ce3d.jpg`,
};

const gallery = [
  'gr-b64c569955e4.jpg',
  'gr-8f0d638e360c.jpg',
  'gr-3e1a7742b4cb.jpg',
  'gr-25b9a2ee2c59.jpg',
  'gr-c766411d1a11.jpg',
  'gr-df9e62164acb.jpg',
  'gr-16709d9ab321.jpg',
  'gr-5b1d011620cc.jpg',
].map((name) => `${MEDIA}/${name}`);

/*
 * Only genuine catalogue product slugs belong here.
 * Empty means no manually featured products.
 */

const FEATURED_PRODUCT_SLUGS: string[] = [];
const PRODUCT_LIMIT = 8;

/* =====================================================
   CATALOGUE HELPERS
===================================================== */

function productLink(product: CatalogProduct) {
  return `/shop/${encodeURIComponent(
    product.slug || product.id,
  )}`;
}

function priceLabel(product: CatalogProduct): string {
  const variants = product.variants.filter(
    (variant): variant is CatalogVariant =>
      Number.isSafeInteger(variant.priceMinor) &&
      variant.priceMinor >= 0 &&
      /^[A-Z]{3}$/.test(variant.currency),
  );

  if (!variants.length) {
    return 'Price unavailable';
  }

  // Do not compare prices across different currencies.
  const currency = variants[0].currency;

  const comparable = variants.filter(
    (variant) => variant.currency === currency,
  );

  const cheapest = comparable.reduce(
    (minimum, variant) =>
      variant.priceMinor < minimum.priceMinor
        ? variant
        : minimum,
  );

  try {
    const price = formatPrice(
      cheapest.priceMinor,
      currency,
    );

    return comparable.length > 1
      ? `From ${price}`
      : price;
  } catch {
    return 'Price unavailable';
  }
}

async function selectedProducts(): Promise<CatalogProduct[]> {
  const slugs = [
    ...new Set(
      FEATURED_PRODUCT_SLUGS
        .map((slug) => slug.trim())
        .filter(Boolean),
    ),
  ].slice(0, PRODUCT_LIMIT);

  if (!slugs.length) {
    return [];
  }

  const remaining = new Set(slugs);
  const matching = new Map<string, CatalogProduct>();

  for await (const batch of catalogPages()) {
    for (const item of batch) {
      if (remaining.has(item.slug)) {
        matching.set(item.slug, item);
        remaining.delete(item.slug);
      }
    }

    if (!remaining.size) {
      break;
    }
  }

  return slugs.flatMap((slug) =>
    matching.has(slug)
      ? [matching.get(slug)!]
      : [],
  );
}

/* =====================================================
   HEADER
===================================================== */

function Header() {
  return (
    <>
      <div className="gr-announcement">
        <span>GOLDEN ROSE PERFUME</span>

        <span className="gr-announcement__star">
          ✳
        </span>

        <span>THE BEAUTY OF FRAGRANCE</span>
      </div>

      <header className="gr-header">
        <div className="gr-header__inner">
          <Link
            href="/"
            className="gr-brand"
            aria-label="Golden Rose Perfume homepage"
          >
            <span className="gr-brand__image-wrap">
              <Image
                src="/assets/brand/golden-rose-logo.png"
                alt="Golden Rose Perfume"
                width={1188}
                height={1324}
                sizes="64px"
                className="gr-brand__image"
                preload
              />
            </span>

            <span className="gr-brand__name">
              <strong>Golden Rose</strong>
              <small>PERFUME</small>
            </span>
          </Link>

          <nav
            className="gr-nav"
            aria-label="Main navigation"
          >
            <Link href="/">Discover</Link>
            <Link href="/shop">Shop all</Link>
            <Link href="/#categories">
              Categories
            </Link>
            <Link href="/about">
              Our story
            </Link>
          </nav>

          <div className="gr-header__actions">
            <form
              action="/shop"
              role="search"
              className="gr-header-search"
            >
              <label
                className="gr-sr-only"
                htmlFor="gr-search"
              >
                Search fragrances
              </label>

              <Search
                size={17}
                strokeWidth={1.7}
                aria-hidden="true"
              />

              <input
                id="gr-search"
                type="search"
                name="q"
                maxLength={120}
                placeholder="Search fragrances"
              />
            </form>

            <Link
              href="/account"
              className="gr-header-icon"
              aria-label="Your account"
            >
              <UserRound size={20} />
            </Link>

            <Link
              href="/cart"
              className="gr-header-icon"
              aria-label="Shopping bag"
            >
              <ShoppingBag size={20} />
            </Link>

            <details className="gr-mobile-menu">
              <summary aria-label="Open navigation">
                <Menu size={23} />
              </summary>

              <div className="gr-mobile-menu__panel">
                <form
                  action="/shop"
                  className="gr-mobile-search"
                  role="search"
                >
                  <label
                    className="gr-sr-only"
                    htmlFor="gr-search-mobile"
                  >
                    Search fragrances
                  </label>

                  <Search
                    size={17}
                    aria-hidden="true"
                  />

                  <input
                    id="gr-search-mobile"
                    type="search"
                    name="q"
                    maxLength={120}
                    placeholder="Search fragrances"
                  />

                  <button
                    type="submit"
                    aria-label="Submit search"
                  >
                    <ArrowRight size={17} />
                  </button>
                </form>

                <nav aria-label="Mobile navigation">
                  <Link href="/">Discover</Link>
                  <Link href="/shop">Shop all</Link>
                  <Link href="/#categories">
                    Categories
                  </Link>
                  <Link href="/#gallery">
                    Gallery
                  </Link>
                  <Link href="/about">
                    Our story
                  </Link>
                  <Link href="/account">
                    Account
                  </Link>
                  <Link href="/cart">
                    Shopping bag
                  </Link>
                </nav>
              </div>
            </details>
          </div>
        </div>
      </header>
    </>
  );
}

/* =====================================================
   PRODUCT CARDS — LIVE DATA
===================================================== */

function ProductCard({
  product,
}: {
  product: CatalogProduct;
}) {
  return (
    <Link
      href={productLink(product)}
      className="
        gr-product-card
        gr-rail__item
        gr-scene
        gr-scene--rise
      "
      aria-label={`View ${product.name}`}
    >
      <div className="gr-product-card__visual">
        <ProductPhoto
          image={product.images?.[0]}
          name={product.name}
          sizes="(max-width: 640px) 80vw, (max-width: 1050px) 40vw, 300px"
        />

        <span
          className="gr-product-card__action"
          aria-hidden="true"
        >
          <ArrowUpRight size={19} />
        </span>
      </div>

      <div className="gr-product-card__details">
        <p className="gr-product-card__brand">
          {product.brand ||
            product.category ||
            'Fragrance'}
        </p>

        <h3>{product.name}</h3>

        <div className="gr-product-card__bottom">
          <strong>
            {priceLabel(product)}
          </strong>

          <span>
            Explore fragrance
          </span>
        </div>
      </div>
    </Link>
  );
}

function ProductRow({
  eyebrow,
  title,
  caption,
  products,
}: {
  eyebrow: string;
  title: string;
  caption: string;
  products: CatalogProduct[];
}) {
  if (!products.length) {
    return null;
  }

  return (
    <section className="gr-products-section gr-home-floatspace">
      <div className="gr-container">
        <div className="gr-section-heading">
          <div className="gr-scene gr-scene--left">
            <span className="gr-eyebrow">
              {eyebrow}
            </span>

            <h2>{title}</h2>

            <p>{caption}</p>
          </div>

          <Link
            href="/shop"
            className="gr-text-link gr-scene gr-scene--right"
          >
            View all
            <ArrowUpRight size={18} />
          </Link>
        </div>

        <HomeRail
          variant="products"
          label={title}
        >
          {products.map((product) => (
            <ProductCard
              product={product}
              key={product.id}
            />
          ))}
        </HomeRail>
      </div>
    </section>
  );
}

/* =====================================================
   REAL CATEGORIES
===================================================== */

function Categories({
  categories,
}: {
  categories: string[];
}) {
  if (!categories.length) {
    return null;
  }

  return (
    <section
      id="categories"
      className="gr-categories gr-home-categories"
    >
      <div className="gr-container">
        <div className="gr-section-heading gr-scene gr-scene--left">
          <div>
            <span className="gr-eyebrow">
              DISCOVER BY CATEGORY
            </span>

            <h2>
              Follow your <em>curiosity.</em>
            </h2>

            <p>
              Explore the categories currently
              available in our boutique.
            </p>
          </div>

          <Link
            href="/shop"
            className="gr-text-link"
          >
            All fragrances
            <ArrowUpRight size={18} />
          </Link>
        </div>

        <div className="gr-category-grid">
          {categories
            .slice(0, 8)
            .map((category, index) => (
              <Link
                key={category}
                href={`/shop?category=${encodeURIComponent(
                  category,
                )}`}
                className="gr-category-card gr-scene gr-scene--rise"
                style={{
                  animationDelay: `${
                    (index % 4) * 65
                  }ms`,
                }}
              >
                <span className="gr-category-card__top">
                  <span>
                    {String(index + 1).padStart(
                      2,
                      '0',
                    )}
                  </span>

                  <ArrowUpRight size={19} />
                </span>

                <strong>{category}</strong>

                <span className="gr-category-card__bottom">
                  Explore
                  <ArrowRight size={15} />
                </span>
              </Link>
            ))}
        </div>
      </div>
    </section>
  );
}

/* =====================================================
   LIVE CATALOGUE
===================================================== */

async function LiveCatalogue() {
  await connection();

  try {
    const [catalogue, featured] =
      await Promise.all([
        getCatalogPage(0, 24),
        selectedProducts(),
      ]);

    const featuredIds = new Set(
      featured.map((item) => item.id),
    );

    const recent = catalogue.newArrivals.filter(
      (item) => !featuredIds.has(item.id),
    );

    const products = (
      recent.length
        ? recent
        : catalogue.items
    )
      .filter(
        (item) => !featuredIds.has(item.id),
      )
      .slice(0, PRODUCT_LIMIT);

    const categories = [
      ...new Set(
        [
          ...catalogue.categories,
          ...catalogue.items.map(
            (item) => item.category,
          ),
        ]
          .filter(
            (item): item is string =>
              typeof item === 'string' &&
              !!item.trim(),
          )
          .map((item) => item.trim()),
      ),
    ].sort((a, b) => a.localeCompare(b));

    return (
      <>
        <ProductRow
          eyebrow="CURATED FOR THE HOMEPAGE"
          title="The Golden Rose edit."
          caption="Real fragrances selected from the catalogue."
          products={featured}
        />

        <ProductRow
          eyebrow={
            recent.length
              ? 'RECENTLY ADDED'
              : 'THE BOUTIQUE'
          }
          title={
            recent.length
              ? 'Fresh in the boutique.'
              : 'Discover your next favourite.'
          }
          caption="Explore fragrances and their available variants."
          products={products}
        />

        <Categories categories={categories} />

        {!featured.length &&
          !products.length && (
            <div className="gr-container gr-catalogue-empty">
              <h2>
                Explore the full collection.
              </h2>

              <p>
                Available products will appear
                here once the catalogue loads.
              </p>

              <Link
                href="/shop"
                className="gr-button gr-button--dark"
              >
                Browse the shop
                <ArrowUpRight size={17} />
              </Link>
            </div>
          )}
      </>
    );
  } catch {
    return (
      <div className="gr-container gr-catalogue-empty">
        <h2>
          The collection is waiting.
        </h2>

        <p>
          Homepage products are temporarily
          unavailable. You can still try
          browsing the shop.
        </p>

        <Link
          href="/shop"
          className="gr-button gr-button--dark"
        >
          Go to the shop
          <ArrowUpRight size={17} />
        </Link>
      </div>
    );
  }
}

/* =====================================================
   EDITORIAL COMPOSITION
===================================================== */

function Editorial() {
  return (
    <section
      className="gr-editorial gr-container gr-home-editorial"
      aria-label="Golden Rose fragrance photographs"
    >
      <div className="gr-editorial__heading gr-scene gr-scene--left">
        <span className="gr-eyebrow">
          FRAGRANCE, IN FOCUS
        </span>

        <h2>
          A closer look.{' '}
          <em>A new perspective.</em>
        </h2>
      </div>

      <div className="gr-editorial__grid">
        <div className="gr-editorial__main gr-scene gr-scene--left">
          <Image
            src={photos.lead}
            alt="Fragrance photography shared by Golden Rose"
            fill
            sizes="(max-width: 800px) 100vw, 65vw"
          />

          <div className="gr-editorial__overlay">
            <span>
              DISCOVER GOLDEN ROSE
            </span>

            <h3>
              Find your next
              <br />
              favourite scent.
            </h3>

            <Link href="/shop">
              Explore fragrances
              <ArrowUpRight size={19} />
            </Link>
          </div>
        </div>

        <div className="gr-editorial__side gr-scene gr-scene--right">
          <div className="gr-editorial__side-image">
            <Image
              src={photos.side}
              alt="Golden Rose perfume photograph"
              fill
              sizes="(max-width: 800px) 100vw, 35vw"
            />
          </div>

          <div className="gr-editorial__side-caption">
            <span>
              YOUR STYLE, YOUR CHOICE
            </span>

            <h3>
              Fragrance for every moment.
            </h3>

            <Link href="/shop">
              Discover more
              <ArrowUpRight size={18} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =====================================================
   HORIZONTAL PHOTO GALLERY
===================================================== */

function Gallery() {
  return (
    <section
      id="gallery"
      className="gr-gallery-section gr-home-gallery"
    >
      <div className="gr-container">
        <div className="gr-section-heading">
          <div className="gr-scene gr-scene--left">
            <span className="gr-eyebrow">
              THE PHOTO DIARY
            </span>

            <h2>
              More to <em>discover.</em>
            </h2>

            <p>
              Real photographs from the
              Golden Rose channel.
              Swipe to explore.
            </p>
          </div>

          <Link
            href="/shop"
            className="gr-text-link gr-scene gr-scene--right"
          >
            Shop fragrances
            <ArrowUpRight size={18} />
          </Link>
        </div>

        <HomeRail
          label="Golden Rose photo diary"
          variant="gallery"
        >
          {gallery.map((src, index) => (
            <figure
              className="gr-gallery-card gr-rail__item gr-scene gr-scene--rise"
              key={src}
            >
              <div className="gr-gallery-card__image">
                <Image
                  src={src}
                  alt={`Golden Rose fragrance channel photograph ${
                    index + 1
                  }`}
                  fill
                  sizes="(max-width: 640px) 78vw, 340px"
                  className="gr-gallery-card__photo"
                />
              </div>

              <figcaption>
                <span>
                  {String(index + 1).padStart(
                    2,
                    '0',
                  )}
                  {' / '}
                  GOLDEN ROSE
                </span>

                <Flower2
                  size={17}
                  aria-hidden="true"
                />
              </figcaption>
            </figure>
          ))}
        </HomeRail>
      </div>
    </section>
  );
}

/* =====================================================
   FOOTER
===================================================== */

function Footer() {
  const whatsapp = getWhatsAppNumber();

  return (
    <footer className="gr-footer">
      <div className="gr-container">
        <div className="gr-footer__main">
          <div className="gr-footer__brand">
            <span className="gr-footer__mark">
              <Image
                src="/assets/brand/golden-rose-logo.png"
                alt="Golden Rose Perfume"
                width={1188}
                height={1324}
                sizes="72px"
              />
            </span>

            <h2>
              Golden Rose Perfume
            </h2>

            <p>
              Fragrances for every moment,
              mood and memory.
            </p>
          </div>

          <div className="gr-footer__links">
            <h3>Explore</h3>

            <Link href="/shop">
              Shop all
            </Link>

            <Link href="/#categories">
              Categories
            </Link>

            <Link href="/#gallery">
              Photo diary
            </Link>

            <Link href="/about">
              Our story
            </Link>
          </div>

          <div className="gr-footer__links">
            <h3>Your boutique</h3>

            <Link href="/account">
              Account
            </Link>

            <Link href="/cart">
              Shopping bag
            </Link>

            <Link href="/checkout">
              Checkout
            </Link>
          </div>

          <div className="gr-footer__links">
            <h3>Get in touch</h3>

            <p>
              Questions about a fragrance
              or an order?
            </p>

            {whatsapp && (
              <a
                href={`https://wa.me/${whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="gr-footer__contact"
              >
                Chat on WhatsApp
                <ArrowUpRight size={16} />
              </a>
            )}
          </div>
        </div>

        <div className="gr-footer__bottom">
          <span>
            © <HomepageCopyrightYear />{' '}
            Golden Rose Perfume.
            All rights reserved.
          </span>

          <span>
            The beauty of fragrance.
          </span>
        </div>
      </div>
    </footer>
  );
}

/* =====================================================
   PAGE-LOCAL MOTION SYSTEM

   Self-contained, scoped to .gr-home.

   Chrome and Edge support scroll-driven animations.
   Other browsers keep the content visible.

   No extra component or CSS file is necessary.
===================================================== */

const motionCSS = `
.gr-home {
  scroll-behavior: smooth;
}

.gr-home .gr-hero__layout {
  min-height: 590px;
  padding-block: 40px 48px;
}

.gr-home .gr-hero__image-frame {
  height: clamp(420px, 39vw, 515px);
  border-radius: 18px;
}

.gr-home .gr-hero__floating-label {
  display: none;
}

.gr-home .gr-intro {
  padding-top: 96px;
  padding-bottom: 88px;
}

.gr-home .gr-products-section {
  padding-top: 25px;
  padding-bottom: 88px;
}

.gr-home .gr-editorial {
  padding-top: 88px;
  padding-bottom: 96px;
}

.gr-home .gr-gallery-section {
  padding-block: 96px;
}

.gr-home .gr-category-card {
  min-height: 175px;
}

.gr-home .gr-experience {
  padding-block: 96px;
}

.gr-home .gr-experience__step {
  min-height: 245px;
}

.gr-home .gr-statement {
  padding-block: 105px;
}

.gr-home .gr-product-card__visual {
  border-radius: 13px;
}

.gr-home .gr-gallery-card__image {
  border-radius: 13px;
}

.gr-home .gr-product-card__visual img {
  transition:
    transform .75s cubic-bezier(.22, 1, .36, 1);
}

.gr-home .gr-product-card:hover
.gr-product-card__visual img {
  transform: scale(1.055);
}

.gr-home .gr-gallery-card:hover
.gr-gallery-card__photo {
  transform: scale(1.06);
}

.gr-home .gr-category-card {
  transition:
    transform .45s cubic-bezier(.22, 1, .36, 1),
    box-shadow .3s;
}

.gr-home .gr-category-card:hover {
  transform: translateY(-7px);
}

.gr-home .gr-editorial__main > img,
.gr-home .gr-editorial__side-image > img,
.gr-home .gr-story__image > img {
  transition:
    transform 1.2s cubic-bezier(.22, 1, .36, 1);
}

.gr-home .gr-editorial__main:hover > img,
.gr-home .gr-editorial__side:hover img {
  transform: scale(1.055);
}

/* New editorial section */

.gr-home .gr-photo-mosaic {
  display: grid;
  grid-template-columns: 1.05fr .95fr;
  gap: 24px;
  align-items: center;
  padding: 12px 0 105px;
}

.gr-home .gr-photo-mosaic__visual {
  position: relative;
  min-height: 470px;
  border-radius: 20px;
  overflow: hidden;
  background: #e8d9d7;
}

.gr-home .gr-photo-mosaic__visual img {
  object-fit: cover;
  transition:
    transform 1.2s cubic-bezier(.22, 1, .36, 1);
}

.gr-home .gr-photo-mosaic__visual:hover img {
  transform: scale(1.05);
}

.gr-home .gr-photo-mosaic__copy {
  padding: 40px clamp(20px, 5vw, 85px);
}

.gr-home .gr-photo-mosaic__copy h2 {
  margin-top: 22px;
  font-size: clamp(39px, 4.6vw, 67px);
  line-height: 1.1;
  letter-spacing: -.06em;
}

.gr-home .gr-photo-mosaic__copy h2 em {
  font-family: Georgia, serif;
  font-weight: 400;
  color: var(--gr-accent);
}

.gr-home .gr-photo-mosaic__copy > p {
  max-width: 390px;
  margin-top: 23px;
  color: var(--gr-muted);
  line-height: 1.85;
  font-size: 14px;
}

.gr-home .gr-photo-mosaic__copy .gr-text-link {
  margin-top: 26px;
}

/* Minimal quick navigation */

.gr-home .gr-quicklinks {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 28px;
  padding: 20px 18px;
  border-bottom: 1px solid var(--gr-border);
}

.gr-home .gr-quicklinks a {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-size: 11px;
  font-weight: 700;
  color: var(--gr-muted);
  transition:
    color .2s,
    transform .2s;
}

.gr-home .gr-quicklinks a:hover {
  color: var(--gr-accent);
  transform: translateY(-2px);
}

/* Directional entrance animations */

@keyframes gr-enter-left {
  from {
    opacity: .25;
    transform: translate3d(-58px, 0, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@keyframes gr-enter-right {
  from {
    opacity: .25;
    transform: translate3d(58px, 0, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@keyframes gr-enter-up {
  from {
    opacity: .25;
    transform: translate3d(0, 40px, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

/* Scroll-linked image depth */

@keyframes gr-photo-drift {
  from {
    transform:
      scale(1.06) translate3d(0, -2%, 0);
  }
  to {
    transform:
      scale(1.06) translate3d(0, 2%, 0);
  }
}

/*
 * Scroll progress controls the movement.
 * Scroll back up and the transition reverses.
 *
 * This progressively enhances browsers that
 * support CSS view timelines.
 */

@supports (animation-timeline: view()) {
  .gr-home .gr-scene {
    animation-duration: 1s;
    animation-timing-function: linear;
    animation-fill-mode: both;
    animation-timeline: view();
    animation-range: entry 0% cover 28%;
  }

  .gr-home .gr-scene--left {
    animation-name: gr-enter-left;
  }

  .gr-home .gr-scene--right {
    animation-name: gr-enter-right;
  }

  .gr-home .gr-scene--rise {
    animation-name: gr-enter-up;
  }

  /* Horizontal carousel items enter from the side */

  .gr-home .gr-rail__item.gr-scene {
    animation-timeline: view(inline);
    animation-range: entry 0% cover 28%;
  }

  .gr-home .gr-editorial__main > img,
  .gr-home .gr-story__image > img {
    animation: gr-photo-drift linear both;
    animation-timeline: view();
    animation-range: entry 0% exit 100%;
  }
}

/* Responsive layout */

@media (max-width: 920px) {
  .gr-home .gr-hero__layout {
    min-height: 530px;
  }

  .gr-home .gr-photo-mosaic {
    grid-template-columns: 1fr 1fr;
    gap: 18px;
  }

  .gr-home .gr-photo-mosaic__visual {
    min-height: 390px;
  }

  .gr-home .gr-photo-mosaic__copy {
    padding: 25px;
  }
}

@media (max-width: 700px) {
  .gr-home .gr-hero__layout {
    min-height: 0;
    padding-block: 40px 48px;
  }

  .gr-home .gr-hero__image-frame {
    height: 415px;
  }

  .gr-home .gr-intro {
    padding-block: 76px 65px;
  }

  .gr-home .gr-editorial {
    padding-block: 74px 82px;
  }

  .gr-home .gr-gallery-section {
    padding-block: 78px;
  }

  .gr-home .gr-quicklinks {
    gap: 17px;
    flex-wrap: wrap;
  }

  .gr-home .gr-photo-mosaic {
    grid-template-columns: 1fr;
    padding-bottom: 78px;
  }

  .gr-home .gr-photo-mosaic__visual {
    min-height: 355px;
  }

  .gr-home .gr-photo-mosaic__copy {
    padding: 25px 4px 10px;
  }

  .gr-home .gr-photo-mosaic__copy h2 {
    font-size: 45px;
  }

  .gr-home .gr-experience {
    padding-block: 78px;
  }
}

/* Respect reduced-motion preferences */

@media (prefers-reduced-motion: reduce) {
  .gr-home .gr-scene,
  .gr-home .gr-editorial__main > img,
  .gr-home .gr-story__image > img {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }

  .gr-home .gr-product-card__visual img,
  .gr-home .gr-gallery-card__photo {
    transition: none !important;
  }

  .gr-home {
    scroll-behavior: auto;
  }
}
`;

/* =====================================================
   COMPLETE HOMEPAGE
===================================================== */

export default function HomePage() {
  return (
    <div className="gr-home">
      <style>{motionCSS}</style>

      <Header />

      <main id="main-content">
        {/* 01 — Existing animated hero */}

        <HeroSlideshow />

        {/* 02 — Compact navigation */}

        <nav
          className="gr-quicklinks"
          aria-label="Explore homepage"
        >
          <a href="#fragrances">
            Fragrances
            <ArrowDown size={14} />
          </a>

          <a href="#categories">
            Categories
            <ArrowDown size={14} />
          </a>

          <a href="#gallery">
            Photo diary
            <ArrowDown size={14} />
          </a>
        </nav>

        {/* 03 — Moving brand marquee */}

        <div
          className="gr-marquee"
          aria-label="Golden Rose Perfume"
        >
          <div
            className="gr-marquee__track"
            aria-hidden="true"
          >
            {[0, 1].map((copy) => (
              <div
                className="gr-marquee__group"
                key={copy}
              >
                <span>
                  YOUR SCENT. YOUR STORY.
                </span>

                <Flower2 size={18} />

                <span>
                  THE BEAUTY OF FRAGRANCE
                </span>

                <Flower2 size={18} />

                <span>
                  GOLDEN ROSE PERFUME
                </span>

                <Flower2 size={18} />
              </div>
            ))}
          </div>
        </div>

        {/* 04 — Left/right animated introduction */}

        <section
          className="gr-intro gr-container"
          aria-labelledby="gr-intro-heading"
        >
          <div className="gr-intro__main gr-scene gr-scene--left">
            <span className="gr-eyebrow">
              WELCOME TO GOLDEN ROSE
            </span>

            <h2 id="gr-intro-heading">
              A little fragrance.
              <br />
              <em>A lot of personality.</em>
            </h2>
          </div>

          <div className="gr-intro__aside gr-scene gr-scene--right">
            <p>
              Find scents that speak to your mood
              and style. Explore the collection and
              discover something that feels like you.
            </p>

            <Link
              href="/shop"
              className="gr-text-link"
            >
              Explore the boutique
              <ArrowUpRight size={18} />
            </Link>
          </div>
        </section>

        {/* 05 — Real catalogue carousels */}

        <div id="fragrances">
          <Suspense
            fallback={
              <div
                className="gr-container gr-loading"
                role="status"
              >
                <span className="gr-loading__indicator" />
                <span>
                  Loading fragrances…
                </span>
              </div>
            }
          >
            <LiveCatalogue />
          </Suspense>
        </div>

        {/* 06 — Asymmetric photo composition */}

        <Editorial />

        {/* 07 — Horizontal photography rail */}

        <Gallery />

        {/* 08 — Animated brand statement */}

        <section
          className="gr-statement"
          aria-label="The beauty of fragrance"
        >
          <div className="gr-container gr-statement__inner gr-scene gr-scene--rise">
            <Flower2
              size={34}
              strokeWidth={1.1}
              aria-hidden="true"
            />

            <span className="gr-eyebrow">
              THE BEAUTY OF FRAGRANCE
            </span>

            <h2>
              Some moments fade.
              <br />
              <em>The feeling stays.</em>
            </h2>

            <p>
              Explore fragrances that
              become part of your story.
            </p>
          </div>
        </section>

        {/* 09 — Shopping experience */}

        <section
          className="gr-experience"
          aria-labelledby="gr-experience-heading"
        >
          <div className="gr-container">
            <div className="gr-experience__intro gr-scene gr-scene--left">
              <span className="gr-eyebrow">
                A SIMPLE WAY TO SHOP
              </span>

              <h2 id="gr-experience-heading">
                Discover. Choose.
                <br />
                <em>Make it yours.</em>
              </h2>

              <p>
                Browse the catalogue, explore available
                options and prepare your order.
              </p>
            </div>

            <div className="gr-experience__steps">
              {[
                {
                  number: '01',
                  icon: Search,
                  title: 'Discover',
                  text: 'Explore fragrances and find your favourites.',
                },
                {
                  number: '02',
                  icon: Heart,
                  title: 'Choose',
                  text: 'Check the product and available sizes.',
                },
                {
                  number: '03',
                  icon: MessageCircle,
                  title: 'Connect',
                  text: 'Prepare your order and confirm on WhatsApp.',
                },
              ].map(
                ({
                  number,
                  icon: Icon,
                  title,
                  text,
                }) => (
                  <article
                    className="gr-experience__step gr-scene gr-scene--rise"
                    key={number}
                  >
                    <div className="gr-experience__step-top">
                      <span>{number}</span>

                      <span className="gr-experience__step-icon">
                        <Icon
                          size={23}
                          strokeWidth={1.6}
                        />
                      </span>
                    </div>

                    <h3>{title}</h3>

                    <p>{text}</p>
                  </article>
                ),
              )}
            </div>
          </div>
        </section>

        {/* 10 — New photo-and-copy feature */}

        <section
          className="gr-photo-mosaic gr-container"
          aria-label="Fragrance inspiration"
        >
          <div className="gr-photo-mosaic__visual gr-scene gr-scene--left">
            <Image
              src={photos.detail}
              alt="Perfume photograph from the Golden Rose channel"
              fill
              sizes="(max-width: 700px) 100vw, 50vw"
            />
          </div>

          <div className="gr-photo-mosaic__copy gr-scene gr-scene--right">
            <span className="gr-eyebrow">
              THE FRAGRANCE JOURNAL
            </span>

            <h2>
              Every detail.
              <br />
              <em>Every feeling.</em>
            </h2>

            <p>
              From everyday favourites to something
              that surprises you, there's always
              more to discover.
            </p>

            <Link
              href="/shop"
              className="gr-text-link"
            >
              Discover more
              <ArrowUpRight size={18} />
            </Link>
          </div>
        </section>

        {/* 11 — Story with opposite-direction reveals */}

        <section
          id="our-story"
          className="gr-story"
        >
          <div className="gr-story__image gr-scene gr-scene--left">
            <Image
              src={photos.story}
              alt="Golden Rose fragrance campaign photo"
              fill
              sizes="(max-width: 850px) 100vw, 50vw"
            />
          </div>

          <div className="gr-story__content gr-scene gr-scene--right">
            <span className="gr-eyebrow">
              OUR WORLD
            </span>

            <h2>
              More than a scent.
              <br />
              <em>It's a feeling.</em>
            </h2>

            <p>
              A familiar fragrance can bring back
              a memory. A new scent can become
              a part of one.
            </p>

            <p>
              Discover the Golden Rose catalogue
              and find a fragrance that feels
              right for you.
            </p>

            <Link
              href="/shop"
              className="gr-text-link"
            >
              Explore Golden Rose
              <ArrowUpRight size={18} />
            </Link>
          </div>
        </section>

        {/* 12 — Final campaign */}

        <section className="gr-final">
          <Image
            src={photos.ending}
            alt=""
            fill
            sizes="100vw"
            className="gr-final__image"
          />

          <div className="gr-final__shade" />

          <div className="gr-final__content gr-scene gr-scene--rise">
            <span className="gr-eyebrow">
              YOUR NEXT SIGNATURE AWAITS
            </span>

            <h2>
              Ready for your
              <br />
              <em>next favourite?</em>
            </h2>

            <p>
              Explore the Golden Rose boutique.
            </p>

            <Link
              href="/shop"
              className="gr-button gr-button--light"
            >
              Shop the collection
              <ArrowUpRight size={18} />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

async function HomepageCopyrightYear() {
  'use cache';
  return new Date().getFullYear();
}
