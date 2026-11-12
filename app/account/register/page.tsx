import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { CustomerAuthForm } from '@/src/components/customer-auth-form';
import '../page.css';

export const metadata: Metadata = { title: "Make it yours. — Customer account" };

export default function Page() {
  return (
    <main className="gr-auth">
      <header className="gr-auth-header">
        <Link href="/" className="gr-auth-brand" aria-label="Golden Rose Perfume homepage">
          <Image src="/assets/brand/golden-rose-logo.png" alt="Golden Rose Perfume" width={1188} height={1324} unoptimized />
          <span>GOLDEN ROSE<small>BEAUTY OF FRAGRANCE</small></span>
        </Link>
        <Link href="/" className="gr-auth-back">← Back to the store</Link>
      </header>
      <section className="gr-auth-panel" aria-labelledby="auth-title">
        <p className="gr-auth-kicker">JOIN THE GOLDEN ROSE WORLD</p>
        <h1 id="auth-title">Make it yours.</h1>
        <p className="gr-auth-intro">Create your Golden Rose customer account.</p>
        <CustomerAuthForm mode="register" />
        <nav className="gr-auth-links" aria-label="Customer authentication">
          <Link href="/account/login">Already have an account? Sign in</Link>
        </nav>
      </section>
      <footer className="gr-auth-footer">Golden Rose Perfume · Beauty Of Fragrance</footer>
    </main>
  );
}
