import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import AuthForm from '@/src/components/auth-form';
import '../page.css';

export const metadata: Metadata = { title: "Join your team — Staff" };

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
        <p className="gr-auth-kicker">STAFF INVITATION</p>
        <h1 id="auth-title">Join your team</h1>
        <p className="gr-auth-intro">Use the invitation provided by your owner or manager to prepare your staff account.</p>
        <AuthForm mode="accept-invite" />
        <nav className="gr-auth-links" aria-label="Staff access">
          <Link href="/staff/login">Already accepted an invitation? Sign in</Link>
        </nav>
        <p className="gr-auth-footnote">The future server must verify the invitation, its recipient, expiry and assigned role. This preview does not validate invitation codes.</p>
      </section>
      <footer className="gr-auth-footer">Golden Rose Perfume · Internal business access</footer>
    </main>
  );
}
