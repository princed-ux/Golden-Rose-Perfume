import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import AuthForm from '@/src/components/auth-form';
import '../page.css';

export const metadata: Metadata = { title: "Business access — Staff" };

export default function Page() {
  return (
    <main className="gr-auth gr-auth--staff">
      <header className="gr-auth-header">
        <Link href="/" className="gr-auth-brand" aria-label="Golden Rose Perfume homepage">
          <Image src="/assets/brand/golden-rose-logo.png" alt="Golden Rose Perfume" width={1188} height={1324} unoptimized />
          <span>GOLDEN ROSE<small>BUSINESS WORKSPACE</small></span>
        </Link>
        <Link href="/" className="gr-auth-back">← Back to the store</Link>
      </header>
      <section className="gr-auth-panel" aria-labelledby="auth-title">
        <p className="gr-auth-kicker">GOLDEN ROSE · STAFF</p>
        <h1 id="auth-title">Business access</h1>
        <p className="gr-auth-intro">The workspace for your store, your team and daily operations.</p>
        <AuthForm mode="staff-login" />
        <nav className="gr-auth-links" aria-label="Staff access">
          <Link href="/staff/accept-invite">Have an invitation? Accept it here</Link>
        </nav>
        <p className="gr-auth-footnote">Invitation-only access. Ask your owner or manager for an invitation. There is no public staff registration.</p>
      </section>
      <footer className="gr-auth-footer">Golden Rose Perfume · Internal business access</footer>
    </main>
  );
}
