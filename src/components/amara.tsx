'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Flower2, X } from 'lucide-react';
import { discoverFragrances } from '@/app/amara-actions';
import { AMARA_TOPICS, isAmaraPage } from '@/src/lib/customer/amara';
import './amara.css';

type HelpLink = { label: string; href: string; detail?: string };
type Exchange = { question: string; answer?: string; links?: readonly HelpLink[] };

export function Amara({ supportHref }: { supportHref: string | null }) {
  const path = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const [history, setHistory] = useState<Exchange[]>([]);
  const [pending, setPending] = useState(false);
  if (!isAmaraPage(path)) return null;

  function reply(exchange: Exchange) {
    setHistory(items => [...items.slice(-11), exchange]);
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const query = String(new FormData(event.currentTarget).get('fragrance') ?? '').trim();
    reply({ question: query ? 'Find ' + query : 'Show me fragrances' });
    setPending(true);
    try {
      const result = await discoverFragrances(query);
      setHistory(items => [...items.slice(0, -1), { ...items.at(-1)!, answer: result.message, links: result.links }]);
    } catch {
      setHistory(items => [...items.slice(0, -1), { ...items.at(-1)!, answer: 'The catalogue could not be reached. Please try again.' }]);
    } finally {
      setPending(false);
    }
  }

  return <>
    <button type="button" className="gr-amara-launcher" onClick={() => dialog.current?.showModal()} aria-haspopup="dialog"
      aria-label="Open Amara, Golden Rose concierge">
      <Flower2 size={20} aria-hidden="true" /><span>Amara</span>
    </button>
    <dialog ref={dialog} className="gr-amara-drawer" aria-labelledby="amara-title">
      <header>
        <div><h2 id="amara-title">Amara</h2><p>Golden Rose AI Concierge · Guided help</p></div>
        <button type="button" className="gr-amara-close" onClick={() => dialog.current?.close()} aria-label="Close Amara"><X size={20} /></button>
      </header>
      <div className="gr-amara-history" role="log" aria-label="Conversation" aria-live="polite" tabIndex={0}>
        <p>How can I help with your Golden Rose visit?</p>
        {history.map((item, index) => <div key={index} className="gr-amara-exchange">
          <p className="gr-amara-question">{item.question}</p>
          <p>{item.answer ?? 'Checking the live collection…'}</p>
          {item.links?.map(link => <div key={link.href}>
            {link.href.startsWith('https://wa.me/') ? <a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a> :
              <Link href={link.href} onClick={() => dialog.current?.close()}>{link.label}</Link>}
            {link.detail && <p className="gr-amara-detail">{link.detail}</p>}
          </div>)}
        </div>)}
      </div>
      <div className="gr-amara-actions">
        <div className="gr-amara-topics">
          {AMARA_TOPICS.map(topic => <button type="button" key={topic.id} disabled={pending}
            onClick={() => reply({ question: topic.title, answer: topic.reply, links: topic.links })}>{topic.title}</button>)}
          <button type="button" disabled={pending} onClick={() => reply({
            question: 'Talk to Golden Rose',
            answer: supportHref ? 'You can reach the boutique directly on WhatsApp.' : 'The boutique’s WhatsApp contact is not configured yet.',
            links: supportHref ? [{ href: supportHref, label: 'Contact Golden Rose on WhatsApp' }] : [],
          })}>Talk to Golden Rose</button>
        </div>
        <form onSubmit={search}>
          <label htmlFor="amara-search">Find a fragrance</label>
          <div>
            <input id="amara-search" name="fragrance" placeholder="Fragrance name" maxLength={80} type="search" />
            <button disabled={pending}>{pending ? 'Searching…' : 'Search'}</button>
          </div>
        </form>
      </div>
    </dialog>
  </>;
}
