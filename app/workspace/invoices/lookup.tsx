'use client';

import { useState, useTransition } from 'react';
import { workspaceInput, workspaceSecondary } from '@/src/components/workspace/page-layout';
import type { LookupPage } from './lookup-actions';

type Choice = { id: string; label: string; detail: string };

export function InvoiceLookup<T extends Choice>({ title, filterLabel, load, select }: {
  title: string;
  filterLabel: string;
  load: (search: string, offset: number) => Promise<LookupPage<T>>;
  select: (item: T) => void;
}) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ data: LookupPage<T>; search: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const request = (search: string, offset: number) => startTransition(async () => {
    try {
      setResult({ data: await load(search, offset), search });
    } catch {
      setResult({ data: { error: 'The lookup could not be completed. Please retry.' }, search });
    }
  });
  const page = result?.data;

  return <details className="min-w-0 rounded-xl border border-[#e5d6cc] bg-white p-3 sm:p-4">
    <summary className="w-fit cursor-pointer rounded text-sm font-semibold text-[#5a2a42] focus-visible:outline-2 focus-visible:outline-offset-2">{title}</summary>
    <div className="mt-3 grid gap-3">
      <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); request(query, 0); }} aria-busy={pending}>
        <label className="grid min-w-0 flex-1 basis-48 gap-1 text-sm text-[#513840]">{filterLabel}
          <input className={workspaceInput} value={query} onChange={event => setQuery(event.target.value)} maxLength={100} />
        </label>
        <button className={workspaceSecondary} type="submit" disabled={pending}>{pending ? 'Loading…' : 'Show results'}</button>
      </form>
      {page && 'error' in page && page.error && <p role="alert" className="text-sm text-[#8d263f]">{page.error}</p>}
      {page && 'items' in page && page.items && <>
        <p className="text-sm text-[#68535d]" role="status">{page.items.length ? page.items.length + ' choices on this page' : 'No choices on this page'}</p>
        {page.items.length > 0 && <ul className="max-h-60 space-y-1 overflow-auto">
          {page.items.map(item => <li key={item.id}>
            <button className="grid w-full min-w-0 gap-1 rounded-md px-2.5 py-2 text-left text-sm text-[#54213a] hover:bg-[#fcf2e6] focus-visible:outline-2"
              type="button" onClick={() => select(item)} disabled={pending}>
              <span className="break-words font-semibold">{item.label}</span>
              <span className="break-words text-[#68535d]">{item.detail}</span>
            </button>
          </li>)}
        </ul>}
        {(page.offset > 0 || page.hasMore) && <div className="flex flex-wrap gap-2">
          <button type="button" className={workspaceSecondary} disabled={pending || page.offset === 0}
            onClick={() => request(result!.search, Math.max(0, page.offset - page.limit))}>Previous results</button>
          <button type="button" className={workspaceSecondary} disabled={pending || !page.hasMore}
            onClick={() => request(result!.search, page.offset + page.limit)}>Next results</button>
        </div>}
      </>}
    </div>
  </details>;
}
