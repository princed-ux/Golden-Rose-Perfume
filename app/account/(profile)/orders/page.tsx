import type { Metadata } from 'next';
import Link from 'next/link';
import { requireCustomer } from '@/src/lib/customer/session';

export const metadata: Metadata = { title: 'My orders' };

export default async function AccountOrdersPage() {
  await requireCustomer();
  return (
    <section className="flex flex-col items-start gap-5">
      <h1 className="font-serif text-3xl">My orders</h1>
      <div className="w-full rounded border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)] p-6">
        <h2 className="font-serif text-xl">Order updates on WhatsApp</h2>
        <p className="text-sm leading-7 text-[var(--gr-theme-muted)]">Use your WhatsApp conversation with Golden Rose to check confirmation, delivery and order details.</p>
      </div>
      <Link href="/shop" className="button button--dark">Browse perfumes</Link>
    </section>
  );
}
