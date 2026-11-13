
import { Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Flower2,
  Heart,
  MessageCircle,
  ShoppingBag,
  Sparkles,
  UserRound,
} from 'lucide-react';

import { CustomerAccountShell } from '@/src/components/customer-account-shell';
import { requireCustomer } from '@/src/lib/customer/session';
import { getCatalogPage } from '@/src/lib/golden-rose/edge';
import { ProductCard } from '@/src/components/product-card';
import { AuthNotice } from '../auth-notice';

export const metadata: Metadata = {
  title: 'My Account — Golden Rose Perfume',
  description:
    'Your personal Golden Rose fragrance experience.',
};

const editorialCollections = [
  {
    number: '01',
    title: 'The Rose Edit',
    subtitle: 'Delicate & romantic',
    image: '/assets/hero/hero-01.png',
  },
  {
    number: '02',
    title: 'Golden Hour',
    subtitle: 'Warm & radiant',
    image: '/assets/hero/hero-02.png',
  },
  {
    number: '03',
    title: 'After Dark',
    subtitle: 'Bold & unforgettable',
    image: '/assets/hero/hero-03.png',
  },
];

async function CustomerDashboard({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const [customer, catalogue] = await Promise.all([requireCustomer(), getCatalogPage(0, 6).catch(() => null)]);
  const newArrivals = catalogue?.newArrivals ?? [];
  const products = newArrivals.length ? newArrivals : catalogue?.items ?? [];

  const firstName =
    customer.name.trim().split(/\s+/)[0] || 'there';

  return (
    <CustomerAccountShell
      active="overview"
      name={customer.name}
    >
      <div className="grc-dashboard">
        <div className="grc-dashboard__topline">
          <div>
            <p className="grc-eyebrow">
              YOUR GOLDEN ROSE WORLD
            </p>

            <p className="grc-dashboard__welcome">
              Welcome back, {firstName}.
              <span aria-hidden="true"> ✦</span>
            </p>
          </div>

          <span className="grc-dashboard__member-label">
            <CheckCircle2
              size={15}
              aria-hidden="true"
            />
            CUSTOMER ACCOUNT
          </span>
        </div>

        <Suspense fallback={null}>
          <AuthNotice searchParams={searchParams} />
        </Suspense>

        {/* PERSONAL BOUTIQUE HERO */}
        <section
          className="grc-hero"
          aria-labelledby="grc-hero-title"
        >
          <div className="grc-hero__visual">
            <Image
              src="/assets/hero/hero-02.png"
              alt=""
              fill
              priority
              sizes="(max-width: 900px) 100vw, 55vw"
              className="grc-hero__image"
            />
          </div>

          <div className="grc-hero__shade" />

          <div className="grc-hero__content">
            <p className="grc-hero__kicker">
              THE ART OF BEING UNFORGETTABLE
            </p>

            <h1 id="grc-hero-title">
              Your signature
              <br />
              <em>awaits.</em>
            </h1>

            <p>
              A world of beautifully selected fragrances,
              made for the moments that become memories.
            </p>

            <div className="grc-hero__actions">
              <Link
                href="/shop"
                className="grc-button grc-button--gold"
              >
                Explore perfumes
                <ArrowUpRight
                  size={17}
                  aria-hidden="true"
                />
              </Link>

              <Link
                href="/cart"
                className="grc-button grc-button--outline"
              >
                My fragrance bag
              </Link>
            </div>
          </div>

          <span className="grc-hero__number">
            GR — 001
          </span>
        </section>

        {/* ACCOUNT QUICK ACTIONS */}
        <div className="grc-quick-grid">
          <Link
            href="/cart"
            className="grc-quick-card"
          >
            <span className="grc-quick-card__icon">
              <ShoppingBag
                size={23}
                strokeWidth={1.3}
              />
            </span>

            <div>
              <h2>Your fragrance bag</h2>
              <p>
                Continue with the scents you&apos;ve selected.
              </p>
            </div>

            <ArrowUpRight
              className="grc-quick-card__arrow"
              size={18}
            />
          </Link>

          <Link
            href="/account/orders"
            className="grc-quick-card"
          >
            <span className="grc-quick-card__icon">
              <MessageCircle
                size={23}
                strokeWidth={1.3}
              />
            </span>

            <div>
              <h2>Order enquiries</h2>
              <p>
                Understand how WhatsApp orders work.
              </p>
            </div>

            <ArrowUpRight
              className="grc-quick-card__arrow"
              size={18}
            />
          </Link>

          <Link
            href="/account/settings"
            className="grc-quick-card"
          >
            <span className="grc-quick-card__icon">
              <UserRound
                size={23}
                strokeWidth={1.3}
              />
            </span>

            <div>
              <h2>My preferences</h2>
              <p>
                Manage your account and appearance.
              </p>
            </div>

            <ArrowUpRight
              className="grc-quick-card__arrow"
              size={18}
            />
          </Link>
        </div>

        {/* REAL PUBLISHED FRAGRANCES */}
        <section
          className="grc-section"
          aria-labelledby="grc-products-title"
        >
          <div className="grc-section__heading">
            <div>
              <p className="grc-eyebrow">
                DISCOVER YOUR NEXT FAVOURITE
              </p>

              <h2 id="grc-products-title">
                {newArrivals.length ? <>New <em>arrivals.</em></> : <>Explore our <em>collection.</em></>}
              </h2>

              <p>
                Explore fragrances currently available
                in the Golden Rose collection.
              </p>
            </div>

            <Link
              href="/shop"
              className="grc-text-link"
            >
              View all perfumes
              <ArrowRight size={17} />
            </Link>
          </div>

          {!catalogue ? (
            <div
              className="grc-empty"
              role="status"
            >
              <span className="grc-empty__icon">
                <Flower2 size={30} />
              </span>

              <div>
                <h3>
                  The collection couldn&apos;t be loaded.
                </h3>

                <p>
                  Please try again. Your account and
                  shopping bag are still available.
                </p>
              </div>

              <Link
                href="/account/dashboard"
                className="grc-text-link"
              >
                Retry
                <ArrowRight size={16} />
              </Link>
            </div>
          ) : products.length ? (
            <div className="grc-product-grid">
              {products.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  compact
                />
              ))}
            </div>
          ) : (
            <div className="grc-empty grc-empty--collection">
              <span className="grc-empty__icon">
                <Flower2 size={31} strokeWidth={1.2} />
              </span>

              <div>
                <span className="grc-eyebrow">
                  THE COLLECTION IS COMING TOGETHER
                </span>

                <h3>
                  Something beautiful is on its way.
                </h3>

                <p>
                  Golden Rose has not published its
                  fragrance catalogue yet. Once products
                  are available, you&apos;ll discover them here.
                </p>
              </div>

              <Link
                href="/shop"
                className="grc-button grc-button--soft"
              >
                Explore the shop
                <ArrowUpRight size={16} />
              </Link>
            </div>
          )}
        </section>

        {/* CAMPAIGN / EDITORIAL DISCOVERY */}
        <section
          className="grc-section grc-section--editorial"
          aria-labelledby="grc-edits-title"
        >
          <div className="grc-section__heading">
            <div>
              <p className="grc-eyebrow">
                MORE THAN A FRAGRANCE
              </p>

              <h2 id="grc-edits-title">
                Find your <em>feeling.</em>
              </h2>

              <p>
                Discover the different moods of
                the Golden Rose world.
              </p>
            </div>
          </div>

          <div className="grc-editorial-grid">
            {editorialCollections.map(collection => (
              <Link
                href="/shop"
                key={collection.number}
                className="grc-editorial-card"
              >
                <Image
                  src={collection.image}
                  alt=""
                  fill
                  sizes="(max-width: 650px) 100vw, (max-width: 1080px) 50vw, 33vw"
                />

                <div className="grc-editorial-card__shade" />

                <span className="grc-editorial-card__number">
                  {collection.number} / EDIT
                </span>

                <div className="grc-editorial-card__text">
                  <small>{collection.subtitle}</small>

                  <h3>{collection.title}</h3>

                  <span className="grc-editorial-card__circle">
                    <ArrowUpRight
                      size={19}
                      aria-hidden="true"
                    />
                  </span>
                </div>
              </Link>
            ))}
          </div>

          <p className="grc-editorial-caption">
            Campaign collections are inspiration;
            individual fragrances and availability
            appear in the live shop.
          </p>
        </section>

        {/* WHATSAPP CHECKOUT EXPLANATION */}
        <section className="grc-order-story">
          <div className="grc-order-story__icon">
            <Heart
              size={26}
              strokeWidth={1.3}
            />
          </div>

          <div>
            <p className="grc-eyebrow">
              PERSONAL SERVICE, BEAUTIFULLY SIMPLE
            </p>

            <h2>
              Your fragrance journey,
              <br />
              <em>our personal touch.</em>
            </h2>

            <p>
              Add your favourites to your bag and
              continue on WhatsApp. Golden Rose will
              confirm availability, your final total,
              and delivery details directly.
            </p>
          </div>

          <Link
            href="/cart"
            className="grc-button grc-button--gold"
          >
            View my bag
            <ArrowUpRight size={16} />
          </Link>
        </section>

        <div className="grc-dashboard__footnote">
          <Sparkles size={14} />
          <span>
            Your account is private to you.
            Your fragrances, your experience.
          </span>
        </div>
      </div>
    </CustomerAccountShell>
  );
}

export default function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="grc-loading" role="status">
          Preparing your Golden Rose experience…
        </div>
      }
    >
      <CustomerDashboard
        searchParams={searchParams}
      />
    </Suspense>
  );
}
