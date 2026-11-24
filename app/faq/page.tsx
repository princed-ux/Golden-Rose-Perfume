import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronRight, Plus } from 'lucide-react';

import { PublicHelpLayout } from '@/src/components/public-help-layout';
import './faq.css';

export const metadata: Metadata = {
  title: 'Help & FAQ',
  description: 'Answers to common questions about Golden Rose Perfume, orders, payment, delivery and returns.',
};

type Question = { question: string; answer: ReactNode };
type QuestionGroup = { id: string; label: string; questions: Question[] };

const groups: QuestionGroup[] = [
  {
    id: 'shopping',
    label: 'Products & fragrances',
    questions: [
      {
        question: 'How do I find a perfume on Golden Rose?',
        answer: <>Visit the <Link href="/shop">fragrance collection</Link>, search by name or use the available category and price filters. The shop displays products currently published in the catalogue.</>,
      },
      {
        question: 'Where can I see a fragrance description?',
        answer: <>Open a fragrance from the <Link href="/shop">shop</Link> to see its listed description, available variants and any photographs that the boutique has uploaded. If details are missing, contact the team before purchasing.</>,
      },
      {
        question: 'How do I choose a bottle size?',
        answer: 'A fragrance detail page displays the sizes and variants listed by Golden Rose. Choose an available variant and quantity before adding it to your shopping bag.',
      },
      {
        question: 'Are all products shown on the website in stock?',
        answer: 'A published product listing does not guarantee physical stock. Golden Rose confirms availability before completing an order.',
      },
    ],
  },
  {
    id: 'ordering',
    label: 'Orders & payment',
    questions: [
      {
        question: 'How do I place an order?',
        answer: <>Add fragrances to your <Link href="/cart">shopping bag</Link>, review the items, and proceed to <Link href="/checkout">checkout</Link>. The current flow prepares a WhatsApp order message, which you must review and send to Golden Rose. Preparing a message alone does not submit an order.</>,
      },
      {
        question: 'Can I pay directly on the website?',
        answer: 'The current customer checkout prepares a WhatsApp enquiry rather than collecting card or bank payments on the website. Golden Rose confirms the order and payment arrangements directly with you.',
      },
      {
        question: 'Is the price in my bag the final amount?',
        answer: 'The bag shows an estimated item total from the listed catalogue prices. Golden Rose confirms any final charges and applicable delivery costs before payment.',
      },
      {
        question: 'Do I need an account to browse or prepare an order?',
        answer: 'No. You can browse the collection and prepare a shopping bag without signing in.',
      },
    ],
  },
  {
    id: 'delivery',
    label: 'Delivery & after-sales',
    questions: [
      {
        question: 'Where does Golden Rose deliver?',
        answer: <>Available delivery destinations are confirmed with the boutique for each enquiry. Please <Link href="/contact">contact Golden Rose</Link> with your location first.</>,
      },
      {
        question: 'How much does delivery cost, and how long will it take?',
        answer: 'Delivery cost and timing depend on the destination and arrangements for your order. Golden Rose will confirm these before payment.',
      },
      {
        question: 'How can I change or cancel an enquiry?',
        answer: 'Reply in your original order conversation as soon as possible. Any changes or cancellations depend on the order stage and arrangements already made.',
      },
      {
        question: 'What if I want to return a perfume or request a refund?',
        answer: <>Please <Link href="/contact">contact Golden Rose</Link> with your purchase details before returning an item. The team will clarify the applicable terms for your order.</>,
      },
      {
        question: 'Can I track an order on the website?',
        answer: 'The current WhatsApp checkout does not include live website delivery tracking. Please ask the boutique for updates in your order conversation.',
      },
    ],
  },
];

export default function FAQPage() {
  const count = groups.reduce((total, group) => total + group.questions.length, 0);

  return (
    <PublicHelpLayout>
      <div className="gr-help__container gr-faq-compact">
        <nav className="gr-help__breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <ChevronRight size={14} aria-hidden="true" />
          <span aria-current="page">Help & FAQ</span>
        </nav>

        <header className="gr-faq-compact__intro">
          <span className="gr-help__eyebrow">CUSTOMER SUPPORT</span>
          <h1>Help & frequently asked questions</h1>
          <p>Find clear answers about our perfumes, ordering, payment, delivery and after-sales enquiries.</p>
          <span className="gr-faq-compact__count">{count} questions answered</span>
        </header>

        <nav className="gr-faq-compact__topics" aria-label="FAQ topics">
          {groups.map(group => (
            <a href={`#${group.id}`} key={group.id}>{group.label}<ArrowRight size={15} aria-hidden="true" /></a>
          ))}
        </nav>

        <div className="gr-faq-compact__questions">
          {groups.map(group => (
            <section className="gr-faq-compact__group" key={group.id} id={group.id} aria-labelledby={`${group.id}-title`}>
              <h2 id={`${group.id}-title`}>{group.label}</h2>
              <div className="gr-help__accordion">
                {group.questions.map(item => (
                  <details className="gr-help__question" key={item.question}>
                    <summary>
                      <span>{item.question}</span>
                      <Plus className="gr-help__question-icon" size={19} aria-hidden="true" />
                    </summary>
                    <div className="gr-help__answer">{item.answer}</div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="gr-faq-compact__contact" aria-labelledby="more-help-title">
          <div>
            <h2 id="more-help-title">Still need help?</h2>
            <p>Send Golden Rose a message about your fragrance or order.</p>
          </div>
          <Link href="/contact">Contact us <ArrowRight size={17} aria-hidden="true" /></Link>
        </section>
      </div>
    </PublicHelpLayout>
  );
}