
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Flower2 } from 'lucide-react';

import { SiteHeader } from '@/src/components/site-header';
import { getWhatsAppNumber } from '@/src/lib/customer/bag';

import './public-help.css';

export function PublicHelpLayout({
  children,
}: {
  children: ReactNode;
}) {
  const whatsapp = getWhatsAppNumber();

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
              <strong>Need a little guidance?</strong>
              <p>Questions about a fragrance or an order? Reach out to our boutique.</p>
              {whatsapp ? (
                <a
                  href={`https://wa.me/${whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Chat on WhatsApp
                  <ArrowUpRight size={17} aria-hidden="true" />
                </a>
              ) : (
                <Link href="/contact">
                  Contact options
                  <ArrowUpRight size={17} aria-hidden="true" />
                </Link>
              )}
            </div>
          </div>
          <div className="gr-help__container gr-help__footer-bottom">
            <span>© {new Date().getFullYear()} Golden Rose Perfume. All rights reserved.</span>
            <span>THE BEAUTY OF FRAGRANCE</span>
          </div>
        </footer>
      </div>
    </>
  );
}
