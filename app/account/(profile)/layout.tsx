import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/src/components/site-header';

export const metadata: Metadata = { title: 'Customer account' };

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <>
    <SiteHeader />
    <main className="mx-auto flex min-h-[70vh] w-full max-w-5xl flex-col gap-8 px-6 py-12">
      <nav aria-label="Customer account" className="flex flex-wrap gap-6 border-b border-[var(--gr-theme-border)] pb-5">
        <Link href="/account/dashboard" className="text-link">Account overview</Link>
        <Link href="/account/orders" className="text-link">My orders</Link>
        <Link href="/account/settings" className="text-link">Account settings</Link>
      </nav>
      <Suspense fallback={<p role="status">Loading your account…</p>}>{children}</Suspense>
    </main>
  </>;
}
