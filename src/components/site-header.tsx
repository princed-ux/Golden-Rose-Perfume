import Link from 'next/link';
import { ShoppingBag, UserRound } from 'lucide-react';

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container site-header__inner flex-wrap py-4 sm:py-0">
        <Link href="/" className="brand-mark" aria-label="Golden Rose Perfume homepage">
          <span className="brand-mark__symbol">✳</span>
          <span>GOLDEN ROSE <small>PERFUME</small></span>
        </Link>
        <nav className="site-nav" aria-label="Customer site navigation">
          <Link href="/shop">Shop perfumes</Link>
          <Link href="/#collections">Collections</Link>
        </nav>
        <div className="flex items-center gap-5">
          <Link href="/account" className="header-action"><UserRound size={19} aria-hidden="true" /><span>Account</span></Link>
          <Link href="/cart" className="header-action" aria-label="Shopping bag"><ShoppingBag size={19} aria-hidden="true" /><span>Bag</span></Link>
        </div>
      </div>
    </header>
  );
}

