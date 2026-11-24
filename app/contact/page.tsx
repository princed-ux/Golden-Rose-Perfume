import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, ChevronRight, CircleHelp, Mail, MessageCircle } from 'lucide-react';

import { PublicHelpLayout } from '@/src/components/public-help-layout';
import { normalizeWhatsAppNumber } from '@/src/lib/customer/bag';
import { ContactForm } from './contact-form';
import './contact.css';

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Contact Golden Rose Perfume about products, orders, delivery or after-sales enquiries.',
};

function publicEmail(): string | null {
  const address = process.env.NEXT_PUBLIC_GOLDEN_ROSE_CONTACT_EMAIL?.trim() ?? '';
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address) && address.length <= 254 ? address : null;
}

export default function ContactPage() {
  const email = publicEmail();
  // Checkout WhatsApp contacts are not automatically customer-support contacts.
  const whatsapp = normalizeWhatsAppNumber(process.env.NEXT_PUBLIC_GOLDEN_ROSE_CONTACT_WHATSAPP);
  const onlineEnabled = Boolean(
    process.env.RESEND_API_KEY?.trim() &&
    process.env.GOLDEN_ROSE_CONTACT_TO_EMAIL?.trim() &&
    process.env.GOLDEN_ROSE_CONTACT_FROM_EMAIL?.trim(),
  );

  return (
    <PublicHelpLayout>
      <div className="gr-help__container gr-contact">
        <nav className="gr-help__breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <ChevronRight size={14} aria-hidden="true" />
          <span aria-current="page">Contact</span>
        </nav>

        <header className="gr-contact__intro">
          <span className="gr-contact__eyebrow">CONTACT GOLDEN ROSE</span>
          <h1>Contact us</h1>
          <p>Have a question about a fragrance, an order or delivery? Complete the form and we’ll help with your enquiry.</p>
        </header>

        <div className="gr-contact__layout">
          <section className="gr-contact__form-panel" aria-labelledby="gr-contact-form-title">
            <div className="gr-contact__form-heading">
              <h2 id="gr-contact-form-title">Send an enquiry</h2>
              <p>Enter your details and tell us what you need help with.</p>
            </div>
            <ContactForm onlineEnabled={onlineEnabled} contactEmail={email} whatsappNumber={whatsapp} />
          </section>

          <aside className="gr-contact__aside" aria-label="Other contact options">
            <div className="gr-contact__aside-top">
              <span className="gr-contact__eyebrow">OTHER WAYS TO REACH US</span>
              <h2>Contact options</h2>
              <p>You can also reach the boutique directly using a verified contact channel.</p>
            </div>

            {email && (
              <a className="gr-contact__method" href={`mailto:${email}`}>
                <span className="gr-contact__method-icon"><Mail size={20} aria-hidden="true" /></span>
                <span className="gr-contact__method-copy"><strong>Email</strong><small>{email}</small></span>
                <ArrowUpRight size={18} aria-hidden="true" />
              </a>
            )}
            {whatsapp && (
              <a className="gr-contact__method" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">
                <span className="gr-contact__method-icon"><MessageCircle size={20} aria-hidden="true" /></span>
                <span className="gr-contact__method-copy"><strong>WhatsApp</strong><small>Discuss products, orders and delivery</small></span>
                <ArrowUpRight size={18} aria-hidden="true" />
              </a>
            )}
            {!email && !whatsapp && !onlineEnabled && (
              <p className="gr-contact__unavailable" role="status">Direct contact details have not been published yet.</p>
            )}

            <div className="gr-contact__faq-link">
              <CircleHelp size={22} aria-hidden="true" />
              <div>
                <h3>Looking for an answer?</h3>
                <p>Find information about ordering, payments, delivery and returns.</p>
                <Link href="/faq">Visit Help & FAQ <ArrowUpRight size={15} aria-hidden="true" /></Link>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </PublicHelpLayout>
  );
}