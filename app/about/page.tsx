import './about.css';

import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import {
  ArrowDownRight,
  ArrowUpRight,
  Flower2,
  Heart,
  Menu,
  Search,
  ShoppingBag,
  Sparkles,
  UserRound,
} from 'lucide-react';

import HomeRail from '../HomeRail';
import { getWhatsAppNumber } from '@/src/lib/customer/bag';

export const metadata: Metadata = {
  title: 'Our Story',
  description:
    'Get to know Golden Rose Perfume and explore the ideas behind our fragrance boutique.',
};

/*
 * REAL GOLDEN ROSE PHOTOGRAPHS
 *
 * All images are from the Telegram export copied into
 * public/assets/products/telegram-selected/
 *
 * These are campaign images, not product-price associations.
 */

const PHOTO_ROOT = '/assets/products/telegram-selected';

const visuals = {
  hero: `${PHOTO_ROOT}/gr-456e486c1d89.jpg`,
  portrait: `${PHOTO_ROOT}/gr-3bed367cf5c0.jpg`,
  discovery: `${PHOTO_ROOT}/gr-e0a11f5027ba.jpg`,
  ending: `${PHOTO_ROOT}/gr-0d2af9e22ba4.jpg`,
};

const photoDiary = [
  'gr-c8da9ece7f5b.jpg',
  'gr-e871df6a67b8.jpg',
  'gr-3958c14f5074.jpg',
  'gr-931bd506ce3d.jpg',
  'gr-b64c569955e4.jpg',
  'gr-8f0d638e360c.jpg',
  'gr-3e1a7742b4cb.jpg',
  'gr-25b9a2ee2c59.jpg',
].map((filename) => `${PHOTO_ROOT}/${filename}`);

function AboutHeader() {
  return (
    <>
      <div className="gr-about__announcement">
        GOLDEN ROSE PERFUME
        <span aria-hidden="true">✳</span>
        THE BEAUTY OF FRAGRANCE
      </div>

      <header className="gr-about__header">
        <div className="gr-about__header-inner">
          <Link
            href="/"
            className="gr-about__brand"
            aria-label="Golden Rose Perfume home"
          >
            <span className="gr-about__brand-image">
              <Image
                src="/assets/brand/golden-rose-logo.png"
                width={1188}
                height={1324}
                alt="Golden Rose Perfume"
                sizes="52px"
              />
            </span>

            <span className="gr-about__brand-copy">
              <strong>Golden Rose</strong>
              <small>PERFUME</small>
            </span>
          </Link>

          <nav
            className="gr-about__nav"
            aria-label="Main navigation"
          >
            <Link href="/">Discover</Link>
            <Link href="/shop">Shop all</Link>
            <Link href="/#categories">Categories</Link>

            <Link
              href="/about"
              aria-current="page"
            >
              Our story
            </Link>

            <Link href="/contact">Contact</Link>
            <Link href="/faq">Help &amp; FAQ</Link>
          </nav>

          <div className="gr-about__actions">
            <Link
              href="/account"
              aria-label="My account"
            >
              <UserRound
                size={20}
                strokeWidth={1.6}
              />
            </Link>

            <Link
              href="/cart"
              aria-label="Shopping bag"
            >
              <ShoppingBag
                size={20}
                strokeWidth={1.6}
              />
            </Link>

            <details className="gr-about__mobile-menu">
              <summary aria-label="Open navigation menu">
                <Menu size={23} />
              </summary>

              <nav aria-label="Mobile navigation">
                <Link href="/">Discover</Link>
                <Link href="/shop">Shop all</Link>

                <Link href="/#categories">
                  Categories
                </Link>

                <Link
                  href="/about"
                  aria-current="page"
                >
                  Our story
                </Link>

                <Link href="/contact">Contact</Link>
                <Link href="/faq">Help &amp; FAQ</Link>
                <Link href="/account">My account</Link>
                <Link href="/cart">Shopping bag</Link>
              </nav>
            </details>
          </div>
        </div>
      </header>
    </>
  );
}

const principles = [
  {
    number: '01',
    icon: (
      <Search
        size={24}
        strokeWidth={1.5}
        aria-hidden="true"
      />
    ),
    title: 'Discover something new',
    description:
      'Explore different fragrances and find the notes, moods and styles that interest you.',
  },
  {
    number: '02',
    icon: (
      <Heart
        size={24}
        strokeWidth={1.5}
        aria-hidden="true"
      />
    ),
    title: 'Make it personal',
    description:
      'There is no single signature for everyone. Find the fragrance that feels right for you.',
  },
  {
    number: '03',
    icon: (
      <Sparkles
        size={24}
        strokeWidth={1.5}
        aria-hidden="true"
      />
    ),
    title: 'Enjoy the experience',
    description:
      'Browse at your pace, compare available options, and connect with the boutique.',
  },
];

function AboutFooter() {
  const whatsapp = getWhatsAppNumber();

  return (
    <footer className="gr-about__footer">
      <div className="gr-about__container gr-about__footer-grid">
        <div>
          <span className="gr-about__footer-mark">
            <Flower2
              size={27}
              strokeWidth={1.2}
              aria-hidden="true"
            />
          </span>

          <h2>Golden Rose Perfume</h2>

          <p>
            Discover your signature. Make every
            moment your own.
          </p>
        </div>

        <nav aria-label="Footer navigation">
          <Link href="/">Home</Link>

          <Link href="/shop">
            Shop all fragrances
          </Link>

          <Link href="/about">Our story</Link>
          <Link href="/contact">Contact us</Link>
          <Link href="/faq">Help &amp; FAQ</Link>
          <Link href="/cart">Shopping bag</Link>
        </nav>

        <div>
          <strong>Need help?</strong>

          <p>
            Reach out with a question about a
            fragrance or an order.
          </p>

          {whatsapp && (
            <a
              href={`https://wa.me/${whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Chat on WhatsApp

              <ArrowUpRight
                size={15}
                aria-hidden="true"
              />
            </a>
          )}
        </div>
      </div>

      <div className="gr-about__container gr-about__footer-bottom">
        <span>
          © <CopyrightYear /> Golden Rose Perfume
        </span>

        <span>The beauty of fragrance</span>
      </div>
    </footer>
  );
}

async function CopyrightYear() {
  'use cache';

  return new Date().getFullYear();
}

export default function AboutPage() {
  return (
    <div className="gr-about">
      <AboutHeader />

      <main id="main-content">

        {/* 01 — Split editorial cover */}

        <section
          className="gr-about__hero"
          aria-labelledby="about-hero-title"
        >
          <div className="gr-about__container gr-about__hero-grid">
            <div className="gr-about__hero-copy">
              <span className="gr-about__eyebrow">
                GET TO KNOW GOLDEN ROSE
                <span aria-hidden="true">✳</span>
                01 / OUR WORLD
              </span>

              <h1 id="about-hero-title">
                A fragrance is{' '}
                <em>never just a fragrance.</em>
              </h1>

              <p>
                It can reflect a mood, bring back
                a memory, or become part of how
                you express yourself. That is the
                world we love exploring at
                Golden Rose Perfume.
              </p>

              <div className="gr-about__hero-actions">
                <Link
                  href="/shop"
                  className="gr-about__button"
                >
                  Explore fragrances
                  <ArrowUpRight size={18} />
                </Link>

                <a
                  href="#our-approach"
                  className="gr-about__quiet-link"
                >
                  What we believe
                  <ArrowDownRight size={18} />
                </a>
              </div>
            </div>

            <div className="gr-about__hero-visual">
              <div
                className="gr-about__hero-photo gr-about__reveal"
                data-from="right"
              >
                <Image
                  src={visuals.hero}
                  alt="Perfume photograph shared by Golden Rose"
                  fill
                  preload
                  sizes="(max-width: 760px) 100vw, 48vw"
                />
              </div>

              <div
                className="gr-about__hero-mini gr-about__reveal"
                data-from="up"
              >
                <Image
                  src={visuals.portrait}
                  alt="Another fragrance photograph from Golden Rose"
                  fill
                  sizes="(max-width: 760px) 45vw, 180px"
                />
              </div>

              <span
                className="gr-about__hero-vertical"
                aria-hidden="true"
              >
                BEAUTY IN EVERY DETAIL
              </span>
            </div>
          </div>
        </section>

        {/* 02 — Living brand line */}

        <div
          className="gr-about__ribbon"
          aria-hidden="true"
        >
          <div className="gr-about__ribbon-track">
            {[0, 1].map((copy) => (
              <div
                className="gr-about__ribbon-group"
                key={copy}
              >
                <span>YOUR SCENT. YOUR STORY.</span>
                <Flower2 size={17} />

                <span>THE BEAUTY OF FRAGRANCE</span>
                <Flower2 size={17} />

                <span>DISCOVER GOLDEN ROSE</span>
                <Flower2 size={17} />
              </div>
            ))}
          </div>
        </div>

        {/* 03 — Story and imagery */}

        <section
          className="gr-about__story gr-about__container"
          id="the-story"
        >
          <div
            className="gr-about__story-visual gr-about__reveal"
            data-from="left"
          >
            <Image
              src={visuals.discovery}
              alt="Golden Rose fragrance photography"
              fill
              sizes="(max-width: 760px) 100vw, 50vw"
            />

            <span className="gr-about__story-image-note">
              THE GOLDEN ROSE EDIT / 01
            </span>
          </div>

          <div
            className="gr-about__story-copy gr-about__reveal"
            data-from="right"
          >
            <span className="gr-about__eyebrow">
              01 / OUR STORY
            </span>

            <h2>
              Scents can say what{' '}
              <em>words cannot.</em>
            </h2>

            <p>
              Everyone approaches fragrance
              differently. Some look for a
              familiar favourite. Others want
              to discover something entirely new.
            </p>

            <p>
              Golden Rose Perfume is a place
              to explore those possibilities:
              to browse different fragrances,
              discover what appeals to you,
              and choose what feels personal.
            </p>

            <Link
              href="/shop"
              className="gr-about__quiet-link"
            >
              Find your next favourite
              <ArrowUpRight size={17} />
            </Link>
          </div>
        </section>

        {/* 04 — Brand principles */}

        <section
          id="our-approach"
          className="gr-about__principles"
        >
          <div className="gr-about__container">
            <div
              className="gr-about__section-top gr-about__reveal"
              data-from="up"
            >
              <span className="gr-about__eyebrow">
                02 / THE WAY WE SEE IT
              </span>

              <h2>
                Thoughtful, simple,{' '}
                <em>personal.</em>
              </h2>

              <p>
                There is beauty in discovering
                a fragrance that feels like yours.
              </p>
            </div>

            <div className="gr-about__principles-grid">
              {principles.map((item) => (
                <article
                  key={item.number}
                  className="gr-about__principle gr-about__reveal"
                  data-from="up"
                >
                  <div className="gr-about__principle-top">
                    <span>{item.number}</span>
                    {item.icon}
                  </div>

                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 05 — Horizontal photographic diary */}

        <section
          className="gr-about__gallery"
          aria-labelledby="about-gallery-title"
        >
          <div className="gr-about__container">
            <div className="gr-about__section-top gr-about__section-top--split">
              <div
                className="gr-about__reveal"
                data-from="left"
              >
                <span className="gr-about__eyebrow">
                  03 / PHOTO DIARY
                </span>

                <h2 id="about-gallery-title">
                  A little more{' '}
                  <em>inspiration.</em>
                </h2>

                <p>
                  Real photographs from the
                  Golden Rose channel.
                  Swipe through the collection.
                </p>
              </div>

              <Link
                href="/shop"
                className="gr-about__quiet-link gr-about__reveal"
                data-from="right"
              >
                Browse the shop
                <ArrowUpRight size={18} />
              </Link>
            </div>

            <HomeRail
              label="Golden Rose fragrance photo diary"
              variant="gallery"
            >
              {photoDiary.map((src, index) => (
                <figure
                  className="gr-about__gallery-item gr-rail__item"
                  key={src}
                >
                  <div className="gr-about__gallery-photo">
                    <Image
                      src={src}
                      alt={`Fragrance photograph from the Golden Rose channel, ${
                        index + 1
                      }`}
                      fill
                      sizes="(max-width: 700px) 78vw, 330px"
                    />
                  </div>

                  <figcaption>
                    {String(index + 1).padStart(2, '0')}
                    <span>— GOLDEN ROSE</span>
                  </figcaption>
                </figure>
              ))}
            </HomeRail>
          </div>
        </section>

        {/* 06 — Modern campaign card */}

        <section className="gr-about__feature gr-about__container">
          <div
            className="gr-about__feature-copy gr-about__reveal"
            data-from="left"
          >
            <span className="gr-about__eyebrow">
              04 / YOUR NEXT DISCOVERY
            </span>

            <h2>
              Something familiar.{' '}
              <em>Something entirely new.</em>
            </h2>

            <p>
              Whether you already know what
              you love or are still looking,
              the catalogue is yours to explore.
            </p>

            <Link
              href="/shop"
              className="gr-about__button"
            >
              Shop the collection
              <ArrowUpRight size={18} />
            </Link>
          </div>

          <div
            className="gr-about__feature-visual gr-about__reveal"
            data-from="right"
          >
            <Image
              src={visuals.ending}
              alt="Fragrance photography from the Golden Rose channel"
              fill
              sizes="(max-width: 760px) 100vw, 50vw"
            />
          </div>
        </section>

        {/* 07 — Closing brand note */}

        <section className="gr-about__closing">
          <div
            className="gr-about__container gr-about__closing-inner gr-about__reveal"
            data-from="up"
          >
            <Flower2
              size={35}
              strokeWidth={1.1}
              aria-hidden="true"
            />

            <p className="gr-about__eyebrow">
              GOLDEN ROSE PERFUME
            </p>

            <h2>
              Make it memorable.{' '}
              <em>Make it yours.</em>
            </h2>

            <Link
              href="/shop"
              className="gr-about__button gr-about__button--light"
            >
              Discover your signature
              <ArrowUpRight size={18} />
            </Link>
          </div>
        </section>
      </main>

      <AboutFooter />
    </div>
  );
}