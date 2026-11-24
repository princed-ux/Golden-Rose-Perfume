import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Flower2 } from 'lucide-react';

import { SiteHeader } from '@/src/components/site-header';
import { normalizeWhatsAppNumber } from '@/src/lib/customer/bag';

import './public-help.css';

async function getCopyrightYear() {
  'use cache';
  return new Date().getFullYear();
}

/** Shared structural layout for the customer Contact and FAQ pages. */
export async function PublicHelpLayout({
  children,
}: {
  children: ReactNode;
}) {
  // This support channel is independent from the WhatsApp checkout destination.
  const contactWhatsApp = normalizeWhatsAppNumber(
    process.env.NEXT_PUBLIC_GOLDEN_ROSE_CONTACT_WHATSAPP,
  );
  const copyrightYear = await getCopyrightYear();

  return (
    <>
      <SiteHeader />

      <div className="gr-help">
        <main id="main-content" className="gr-help__main">
          {children}
        </main>

        <footer className="gr-help__footer">
          <div className="gr-help__container gr-help__footer-content">
            <div className="gr-help__footer-brand">
              <Flower2 size={26} strokeWidth={1.2} aria-hidden="true" />
              <strong>Golden Rose <em>Perfume.</em></strong>
              <p>Fragrance for the moments that stay with you.</p>
            </div>

            <nav className="gr-help__footer-links" aria-label="Customer support footer">
              <Link href="/">Discover</Link>
              <Link href="/shop">Shop fragrances</Link>
              <Link href="/about">Our story</Link>
              <Link href="/faq">Frequently asked questions</Link>
              <Link href="/contact">Contact us</Link>
              <Link href="/cart">Shopping bag</Link>
            </nav>

            <div className="gr-help__footer-contact">
              <strong>Need more information?</strong>
              <p>Contact the boutique about fragrance, orders or delivery.</p>
              {contactWhatsApp ? (
                <a href={`https://wa.me/${contactWhatsApp}`} target="_blank" rel="noopener noreferrer">
                  Chat on WhatsApp
                  <ArrowUpRight size={17} aria-hidden="true" />
                </a>
              ) : (
                <Link href="/contact">
                  Contact us
                  <ArrowUpRight size={17} aria-hidden="true" />
                </Link>
              )}
            </div>
          </div>
          <div className="gr-help__container gr-help__footer-bottom">
            <span>© {copyrightYear} Golden Rose Perfume. All rights reserved.</span>
            <span>THE BEAUTY OF FRAGRANCE</span>
          </div>
        </footer>
      </div>
    </>
  );
}
