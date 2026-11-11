import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/src/components/site-header';

export const metadata: Metadata = {
  title: 'Customer account',
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="preview-ribbon">CUSTOMER ACCOUNT PREVIEW · Sign-in is not connected</div>
      <SiteHeader />
      <main className="mx-auto flex min-h-[70vh] w-full max-w-5xl flex-col gap-8 px-6 py-12">
        <nav aria-label="Customer account" className="flex flex-wrap gap-6 border-b border-[#e9e3db] pb-5">
          <Link href="/account" className="text-link">Account overview</Link>
          <Link href="/account/orders" className="text-link">My orders</Link>
          <Link href="/account/settings" className="text-link">Account settings</Link>
        </nav>
        {children}
      </main>
    </>
  );
}
