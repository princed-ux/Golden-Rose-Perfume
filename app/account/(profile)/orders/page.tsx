import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'My orders' };

export default function AccountOrdersPage() {
  return (
    <div className="flex flex-col items-start gap-6">
      <span className="overline">CUSTOMER ACCOUNT</span>
      <h1 className="text-3xl">My orders</h1>
      <p className="max-w-2xl text-sm leading-7 text-[#77706c]">
        Order history, delivery progress and purchase receipts will appear here after customer sign-in and orders are connected.
      </p>
      <div className="w-full rounded border border-[#e9e3db] p-6">
        <h2 className="text-lg">Order history is not connected yet</h2>
        <p className="text-sm leading-7 text-[#77706c]">No customer account or purchase records are loaded in this preview.</p>
      </div>
      <Link href="/shop" className="button button--dark">Browse perfumes</Link>
    </div>
  );
}
