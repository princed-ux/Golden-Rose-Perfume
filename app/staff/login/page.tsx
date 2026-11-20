import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getStaffAccess } from '@/src/lib/golden-rose/staff';
import { getRoleHome } from '@/src/domain/permissions';
import { StaffLoginForm } from './form';
import '../page.css';

export const metadata: Metadata = { title: "Business access — Staff" };

const notices: Record<string, string> = {
  session: 'Sign in to access the business workspace.',
  denied: 'This account does not have active staff access. Contact your owner or manager.',
  unavailable: 'Staff verification is temporarily unavailable. Retry without signing out.',
  signout: 'Sign-out could not be confirmed. Try again from the workspace.',
  'password-changed': 'Your password was changed. Sign in with your new password to continue.',
};

async function AccessNotice({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const message = typeof reason === 'string' && Object.hasOwn(notices, reason) ? notices[reason] : null;
  return message ? <p className="gr-auth-notice" role="status">{message}</p> : null;
}

async function SessionAwareLogin() {
  const access = await getStaffAccess();
  if (!('reason' in access)) redirect(getRoleHome(access.role));
  if (access.reason === 'password') redirect('/staff/change-password');
  return <StaffLoginForm />;
}

export default function Page({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
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
        <Suspense><AccessNotice searchParams={searchParams} /></Suspense>
        <Suspense fallback={<p role="status">Checking your staff session…</p>}><SessionAwareLogin /></Suspense>
        <nav className="gr-auth-links" aria-label="Staff access">
          <Link href="/staff/accept-invite">Have an invitation? Accept it here</Link>
        </nav>
        <p className="gr-auth-footnote">Use your assigned work account or a private invitation from the owner. Staff accounts cannot be registered here.</p>
      </section>
      <footer className="gr-auth-footer">Golden Rose Perfume · Internal business access</footer>
    </main>
  );
}
