import type { Metadata } from 'next';
import Link from 'next/link';
import { CustomerSignOut } from '@/src/components/customer-auth-form';
import { requireCustomer } from '@/src/lib/customer/session';

export const metadata: Metadata = { title: 'Account settings' };

export default async function AccountSettingsPage() {
  const customer = await requireCustomer();
  return (
    <section className="flex flex-col items-start gap-6">
      <h1 className="font-serif text-3xl">Account settings</h1>
      <dl className="grid w-full gap-6 rounded border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)] p-6 sm:grid-cols-2">
        <div><dt className="font-medium">Name</dt><dd className="break-words text-[var(--gr-theme-muted)]">{customer.name || '—'}</dd></div>
        <div><dt className="font-medium">Email address</dt><dd className="break-words text-[var(--gr-theme-muted)]">{customer.email ?? '—'}</dd></div>
      </dl>
      <Link href="/account/forgot-password" className="text-link">Request a password reset</Link>
      <CustomerSignOut />
    </section>
  );
}
