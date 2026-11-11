import Link from 'next/link';
import { ShoppingBag, ArrowLeft } from 'lucide-react';
import { SiteHeader } from '@/src/components/site-header';

export default function CartPage() { return <><div className="preview-ribbon">PREVIEW · No checkout transactions</div><SiteHeader/><main className="container empty-flow"><div className="empty-flow__icon"><ShoppingBag size={30}/></div><span className="overline">CUSTOMER JOURNEY</span><h1>Your future shopping bag.</h1><p>Cart state, inventory validation, discounts and checkout will be connected after the product database and payment policy are approved.</p><div className="empty-flow__actions"><Link href="/shop" className="button button--dark"><ArrowLeft size={17}/> Continue exploring</Link><Link href="/checkout" className="button button--outline">See checkout plan</Link></div></main></>; }

