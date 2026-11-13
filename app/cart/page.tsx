import Link from 'next/link';
import { SiteHeader } from '@/src/components/site-header';
import { ShoppingBagScreen } from '@/src/components/shopping-bag';
import './bag.css';

export default function CartPage() {
  return <>
    <SiteHeader />
    <main className="container page-spacing gr-bag-page">
      <header>
        <Link href="/shop" className="text-link">← Continue shopping</Link>
        <h1>Your shopping bag.</h1>
        <p>Review your fragrances before requesting your order on WhatsApp.</p>
      </header>
      <ShoppingBagScreen />
    </main>
  </>;
}
