import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { employeeInviteCode } from '@/src/lib/golden-rose/employees';
import { EmployeeInvitationForm } from './form';
import '../page.css';

export const metadata: Metadata = { title: 'Employee invitation | Golden Rose', referrer: 'no-referrer', robots: { index: false } };

async function Invitation({ searchParams }: { searchParams: Promise<{ invite?: string; confirmed?: string }> }) {
  const { invite, confirmed } = await searchParams;
  return typeof invite === 'string' && employeeInviteCode.test(invite)
    ? <EmployeeInvitationForm invite={invite} confirmed={confirmed === '1'} />
    : <p>Open the private invitation link shared by your employer.</p>;
}

export default function Page({ searchParams }: { searchParams: Promise<{ invite?: string; confirmed?: string }> }) {
  return <main className="gr-auth gr-auth--staff">
    <section className="gr-auth-panel" aria-labelledby="employee-invitation-title">
      <p className="gr-auth-kicker">Golden Rose staff</p>
      <h1 id="employee-invitation-title">Accept your employee invitation</h1>
      <p className="gr-auth-intro">Use the work email on your invitation. Choose your own password or sign in to an existing account.</p>
      <Suspense fallback={<p role="status">Loading invitation…</p>}><Invitation searchParams={searchParams} /></Suspense>
      <nav className="gr-auth-links" aria-label="Staff access"><Link href="/staff/login">Go to staff sign-in</Link></nav>
    </section>
  </main>;
}
