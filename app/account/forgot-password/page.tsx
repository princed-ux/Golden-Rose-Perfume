import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import AuthForm from '@/src/components/auth-form';
import '../page.css';

export const metadata: Metadata = { title: "A fresh start. — Customer account" };

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
        <p className="gr-auth-kicker">ACCOUNT RECOVERY</p>
        <h1 id="auth-title">A fresh start.</h1>
        <p className="gr-auth-intro">Enter your email to prepare a password reset request.</p>
        <AuthForm mode="forgot-password" />
        <nav className="gr-auth-links" aria-label="Customer authentication">
          <Link href="/account/login">Return to customer sign in</Link>
          <Link href="/account/register">Create a customer account</Link>
        </nav>
        <p className="gr-auth-footnote">Recovery emails will be available when authentication is connected.</p>
      </section>
      <footer className="gr-auth-footer">Golden Rose Perfume · Beauty Of Fragrance</footer>
    </main>
  );
}
