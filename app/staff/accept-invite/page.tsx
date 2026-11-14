import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { OwnerInvitationForm } from './form';
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
        <p className="gr-auth-kicker">OWNER INVITATION</p>
        <h1 id="auth-title">Accept your invitation</h1>
        <p className="gr-auth-intro">Sign in with the confirmed Golden Rose account named on your invitation and enter your code.</p>
        <OwnerInvitationForm />
        <nav className="gr-auth-links" aria-label="Staff access">
          <Link href="/staff/login">Already accepted an invitation? Sign in</Link>
        </nav>
        <p className="gr-auth-footnote">An active owner can issue a new code if yours expires.</p>
      </section>
      <footer className="gr-auth-footer">Golden Rose Perfume · Internal business access</footer>
    </main>
  );
}
