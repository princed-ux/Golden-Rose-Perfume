
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  CircleHelp,
  Mail,
  MapPin,
  MessageCircle,
  PackageCheck,
  Sparkles,
} from 'lucide-react';

import { PublicHelpLayout } from '@/src/components/public-help-layout';
import { getWhatsAppNumber } from '@/src/lib/customer/bag';

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Contact Golden Rose Perfume about fragrances, orders, and delivery arrangements.',
};

const PHOTO = '/assets/products/telegram-selected/gr-456e486c1d89.jpg';

const subjects = [
  {
    icon: Sparkles,
    title: 'Fragrance guidance',
    description: 'Ask about a perfume, a bottle size, or the details listed in our collection.',
    message: 'Hello Golden Rose Perfume, I have a question about a fragrance.',
  },
  {
    icon: PackageCheck,
    title: 'An order enquiry',
    description: 'Follow up on a WhatsApp order conversation or clarify your selections.',
    message: 'Hello Golden Rose Perfume, I would like to ask about my order enquiry.',
  },
  {
    icon: MapPin,
    title: 'Delivery or visiting',
    description: 'Confirm delivery arrangements or ask for up-to-date boutique visiting details.',
    message: 'Hello Golden Rose Perfume, could you help me with delivery or store visiting details?',
  },
] as const;

function whatsappLink(number: string, message: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function publicContactEmail(): string | null {
  const value = process.env.NEXT_PUBLIC_GOLDEN_ROSE_CONTACT_EMAIL?.trim() ?? '';
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  return value;
}

export default function ContactPage() {
  const whatsapp = getWhatsAppNumber();
  const email = publicContactEmail();

  return (
    <PublicHelpLayout>
      <div className="gr-help__container">
        <nav aria-label="Breadcrumb" className="gr-help__breadcrumbs">
          <Link href="/">Home</Link>
          <ChevronRight size={14} aria-hidden="true" />
          <span aria-current="page">Contact us</span>
        </nav>

        <section className="gr-help__hero" aria-labelledby="gr-contact-title">
          <div className="gr-help__hero-copy">
            <span className="gr-help__eyebrow">THE GOLDEN ROSE BOUTIQUE</span>
            <h1 id="gr-contact-title">A beautiful conversation <em>starts here.</em></h1>
            <p>
              Wondering about a fragrance, a selected bottle size, or an order?
              Get in touch with Golden Rose for personal assistance.
            </p>
            <div className="gr-help__hero-actions">
              {whatsapp ? (
                <a
                  className="gr-help__button gr-help__button--dark"
                  href={whatsappLink(whatsapp, 'Hello Golden Rose Perfume, I would like to make an enquiry.')}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle size={18} aria-hidden="true" />
                  Chat on WhatsApp
                  <ArrowUpRight size={17} aria-hidden="true" />
                </a>
              ) : (
                <Link className="gr-help__button gr-help__button--dark" href="/faq">
                  Browse frequently asked questions
                  <ArrowRight size={17} aria-hidden="true" />
                </Link>
              )}
              <Link href="/shop" className="gr-help__text-link">
                Explore fragrances
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
          <div className="gr-help__hero-photo">
            <Image
              src={PHOTO}
              fill
              preload
              sizes="(max-width: 800px) 100vw, 45vw"
              alt="Perfume photography from the Golden Rose collection"
              className="gr-help__hero-image"
            />
            <span className="gr-help__photo-caption">GOLDEN ROSE PERFUME · THE BEAUTY OF FRAGRANCE</span>
          </div>
        </section>

        <section className="gr-help__section" aria-labelledby="contact-help-title">
          <div className="gr-help__section-heading">
            <span className="gr-help__eyebrow">HOW CAN WE HELP?</span>
            <h2 id="contact-help-title">We&apos;re listening.</h2>
            <p>Choose what you would like to discuss. The links open WhatsApp with a suggested message you can edit before sending.</p>
          </div>

          <div className="gr-help__cards">
            {subjects.map(({ icon: Icon, title, description, message }) => (
              <article className="gr-help__card" key={title}>
                <span className="gr-help__card-icon"><Icon size={23} strokeWidth={1.5} aria-hidden="true" /></span>
                <h3>{title}</h3>
                <p>{description}</p>
                {whatsapp && (
                  <a href={whatsappLink(whatsapp, message)} target="_blank" rel="noopener noreferrer">
                    Start a conversation
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </a>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="gr-help__contact-panel" aria-labelledby="contact-methods-title">
          <div>
            <span className="gr-help__eyebrow">CONTACT OPTIONS</span>
            <h2 id="contact-methods-title">Reach the boutique.</h2>
            <p>We'll only display contact channels configured for Golden Rose. Please confirm store visiting details directly before travelling.</p>
          </div>
          <div className="gr-help__contact-methods">
            {whatsapp && (
              <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className="gr-help__contact-method">
                <MessageCircle size={22} aria-hidden="true" />
                <span><strong>WhatsApp</strong><small>Chat with Golden Rose about fragrances and orders.</small></span>
                <ArrowUpRight size={17} aria-hidden="true" />
              </a>
            )}
            {email && (
              <a href={`mailto:${email}?subject=${encodeURIComponent('Golden Rose Perfume enquiry')}`} className="gr-help__contact-method">
                <Mail size={22} aria-hidden="true" />
                <span><strong>Email</strong><small>{email}</small></span>
                <ArrowUpRight size={17} aria-hidden="true" />
              </a>
            )}
            {!whatsapp && !email && (
              <div className="gr-help__contact-method" role="status">
                <MessageCircle size={22} aria-hidden="true" />
                <span><strong>Direct contact is being set up.</strong><small>The boutique has not yet published a verified contact channel on this website. Please check again after contact details are added.</small></span>
              </div>
            )}
          </div>
        </section>

        <section className="gr-help__endcap" aria-labelledby="contact-faq-title">
          <span className="gr-help__endcap-icon"><CircleHelp size={23} aria-hidden="true" /></span>
          <div>
            <span className="gr-help__eyebrow">A LITTLE MORE HELP</span>
            <h2 id="contact-faq-title">Maybe the answer is already here.</h2>
            <p>Find straightforward information about browsing perfumes, preparing an order, and delivery enquiries.</p>
          </div>
          <Link href="/faq" className="gr-help__button gr-help__button--light">
            View FAQs <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </section>
      </div>
    </PublicHelpLayout>
  );
}
