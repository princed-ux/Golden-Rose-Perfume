
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  CircleHelp,
  MessageCircle,
  Plus,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { PublicHelpLayout } from '@/src/components/public-help-layout';
import { getWhatsAppNumber } from '@/src/lib/customer/bag';

export const metadata: Metadata = {
  title: 'Frequently Asked Questions',
  description: 'Answers to common questions about Golden Rose Perfume, fragrances, WhatsApp orders, and delivery.',
};

const PHOTO = '/assets/products/telegram-selected/gr-e0a11f5027ba.jpg';

type Question = { question: string; answer: ReactNode };
type QuestionGroup = { id: string; label: string; description: string; questions: Question[] };

const groups: QuestionGroup[] = [
  {
    id: 'shopping',
    label: 'Discovering fragrances',
    description: 'Finding a fragrance that feels right for you.',
    questions: [
      {
        question: 'How do I find a perfume on Golden Rose?',
        answer: <>Visit the <Link href="/shop">fragrance collection</Link>, search by name, or use the available category and price filters. Only products currently published in the catalogue appear in the shop.</>,
      },
      {
        question: 'Where can I see a fragrance description?',
        answer: <>Open a perfume from the <Link href="/shop">shop</Link>. Its detail page shows the catalogue description, available variants, prices, and any product photographs the boutique has uploaded. If a description is missing, ask the boutique for more details before buying.</>,
      },
      {
        question: 'How do I choose a bottle size?',
        answer: 'Each fragrance detail page lists the sizes and variants supplied by the boutique. Select the variant and quantity you want before adding it to your shopping bag.',
      },
      {
        question: 'Are all products shown on the website in stock?',
        answer: 'The website shows published catalogue products, but a listing is not a guarantee of immediate physical stock. The Golden Rose team confirms availability before an order is completed.',
      },
    ],
  },
  {
    id: 'ordering',
    label: 'Ordering & payment',
    description: 'What happens after you choose your fragrances.',
    questions: [
      {
        question: 'How do I place an order?',
        answer: <>Add your preferred variants to the <Link href="/cart">shopping bag</Link>, review the items, then continue to <Link href="/checkout">WhatsApp checkout</Link>. Enter your contact details, prepare the order message, open WhatsApp, review it, and send it to the boutique. Preparing the message alone does not submit an order.</>,
      },
      {
        question: 'Can I pay directly on the website?',
        answer: 'The current online ordering flow does not collect a card or bank payment on the website. It creates a WhatsApp enquiry. Golden Rose confirms the order, final charges, and payment arrangements directly with you.',
      },
      {
        question: 'Is the price in my bag the final amount?',
        answer: 'Your shopping bag displays an estimated item total using current catalogue prices. The boutique confirms the final item prices and any applicable delivery costs before you pay.',
      },
      {
        question: 'Do I need an account to browse or prepare an order?',
        answer: 'No. You can explore the collection and use the shopping bag without signing in. An account can also help you manage saved fragrances and customer preferences.',
      },
    ],
  },
  {
    id: 'delivery',
    label: 'Delivery & after-sales',
    description: 'Confirm the details that matter before your purchase.',
    questions: [
      {
        question: 'Where does Golden Rose deliver?',
        answer: <>Delivery destinations and arrangements are confirmed by the boutique for each enquiry. Please <Link href="/contact">contact Golden Rose</Link> with your location before assuming delivery is available.</>,
      },
      {
        question: 'How much does delivery cost, and how long will it take?',
        answer: 'Delivery costs and timing are not fixed on this website. The boutique will discuss the destination, applicable charges, and expected arrangements with you before confirming the order.',
      },
      {
        question: 'How can I change or cancel an enquiry?',
        answer: 'Reply in the original WhatsApp conversation as soon as possible. Whether an order can be changed or cancelled depends on the stage of confirmation and fulfilment.',
      },
      {
        question: 'What if I want to return a perfume or request a refund?',
        answer: <>Please <Link href="/contact">contact the boutique</Link> with your purchase details before returning anything. Golden Rose will explain the applicable terms for your order. This website does not currently provide an automatic refund or return request service.</>,
      },
      {
        question: 'Can I track an order on the website?',
        answer: 'There is no live online delivery-tracking service in the current WhatsApp checkout flow. Ask the boutique for updates in your order conversation.',
      },
    ],
  },
];

export default function FAQPage() {
  const whatsapp = getWhatsAppNumber();
  const questionCount = groups.reduce((total, group) => total + group.questions.length, 0);

  return (
    <PublicHelpLayout>
      <div className="gr-help__container">
        <nav className="gr-help__breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <ChevronRight size={14} aria-hidden="true" />
          <span aria-current="page">Frequently asked questions</span>
        </nav>

        <section className="gr-help__hero gr-help__hero--faq" aria-labelledby="gr-faq-title">
          <div className="gr-help__hero-copy">
            <span className="gr-help__eyebrow">HERE TO HELP YOU DISCOVER</span>
            <h1 id="gr-faq-title">Every detail <em>matters.</em></h1>
            <p>Answers about choosing a fragrance, preparing your order, payments, delivery enquiries, and after-sales support.</p>
            <div className="gr-help__hero-actions">
              <a href="#faq-questions" className="gr-help__button gr-help__button--dark">
                Explore {questionCount} answers
                <ArrowRight size={17} aria-hidden="true" />
              </a>
              <Link href="/contact" className="gr-help__text-link">
                Contact us <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
          <div className="gr-help__hero-photo">
            <Image
              src={PHOTO}
              fill
              preload
              sizes="(max-width: 800px) 100vw, 45vw"
              alt="Golden Rose fragrance editorial photography"
              className="gr-help__hero-image"
            />
            <span className="gr-help__photo-caption">QUESTIONS · ANSWERED WITH CARE</span>
          </div>
        </section>

        <section id="faq-questions" className="gr-help__faq" aria-labelledby="faq-questions-heading">
          <div className="gr-help__section-heading">
            <span className="gr-help__eyebrow">THE DETAILS, MADE SIMPLE</span>
            <h2 id="faq-questions-heading">Good questions. <em>Clear answers.</em></h2>
            <p>Choose a topic below or open any question to read the answer.</p>
          </div>

          <nav className="gr-help__faq-nav" aria-label="Frequently asked question topics">
            {groups.map(group => <a href={`#${group.id}`} key={group.id}>{group.label}<ArrowRight size={15} aria-hidden="true" /></a>)}
          </nav>

          {groups.map((group, index) => (
            <section className="gr-help__faq-group" key={group.id} id={group.id} aria-labelledby={`${group.id}-title`}>
              <div className="gr-help__faq-group-heading">
                <span className="gr-help__group-number">{String(index + 1).padStart(2, '0')}</span>
                <h3 id={`${group.id}-title`}>{group.label}</h3>
                <p>{group.description}</p>
              </div>
              <div className="gr-help__accordion">
                {group.questions.map(({ question, answer }) => (
                  <details className="gr-help__question" key={question}>
                    <summary>
                      <span>{question}</span>
                      <Plus className="gr-help__question-icon" size={19} aria-hidden="true" />
                    </summary>
                    <div className="gr-help__answer">{answer}</div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </section>

        <section className="gr-help__endcap" aria-labelledby="faq-end-title">
          <span className="gr-help__endcap-icon"><CircleHelp size={23} aria-hidden="true" /></span>
          <div>
            <span className="gr-help__eyebrow">MORE QUESTIONS?</span>
            <h2 id="faq-end-title">We're happy to help you find the right answer.</h2>
            <p>Ask about a fragrance or discuss an order directly with the Golden Rose team.</p>
          </div>
          {whatsapp ? (
            <a className="gr-help__button gr-help__button--light"
              href={`https://wa.me/${whatsapp}?text=${encodeURIComponent('Hello Golden Rose Perfume, I have a question about your fragrances or ordering process.')}`}
              target="_blank" rel="noopener noreferrer">
              <MessageCircle size={17} aria-hidden="true" /> Chat on WhatsApp
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          ) : (
            <Link className="gr-help__button gr-help__button--light" href="/contact">
              Contact options <ArrowRight size={17} aria-hidden="true" />
            </Link>
          )}
        </section>
      </div>
    </PublicHelpLayout>
  );
}
