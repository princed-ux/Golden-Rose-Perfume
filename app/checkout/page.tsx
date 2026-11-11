import Link from 'next/link';
import { CreditCard, MessageCircle, ArrowLeft } from 'lucide-react';
import { SiteHeader } from '@/src/components/site-header';

export default function CheckoutPage() { return <><div className="preview-ribbon">PREVIEW · No payment collection</div><SiteHeader/><main className="container page-spacing checkout-preview"><Link href="/cart" className="text-link"><ArrowLeft size={16}/> Cart</Link><span className="overline">CHECKOUT WORKFLOW</span><h1>Two ways to order.</h1><p>The production checkout will offer both secure online payment and WhatsApp inquiry routing. These are design placeholders only.</p><div className="checkout-options"><div className="option-card"><CreditCard size={30}/><h2>Pay online</h2><p>Provider verified on the server, with order reservation and payment reconciliation.</p><span>Integration pending</span></div><div className="option-card"><MessageCircle size={30}/><h2>Checkout on WhatsApp</h2><p>One of three configured business numbers receives a prepared order summary.</p><span>Integration pending</span></div></div></main></>; }

