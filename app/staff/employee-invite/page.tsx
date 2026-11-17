import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowLeft, ArrowUpRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import { employeeInviteCode } from '@/src/lib/golden-rose/employees';
import { EmployeeInvitationForm } from './form';
import '../page.css';
import './invite.css';

export const metadata: Metadata = {
  title: 'Accept employee invitation | Golden Rose Perfume',
  description: 'Private staff onboarding for Golden Rose Perfume.',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

type InvitationParams = Promise<{ invite?: string; confirmed?: string }>;

async function Invitation({ searchParams }: { searchParams: InvitationParams }) {
  const { invite, confirmed } = await searchParams;

  if (typeof invite !== 'string' || !employeeInviteCode.test(invite)) {
    return (
      <div className="gr-invite-empty" role="status">
        <LockKeyhole size={25} aria-hidden="true" />
        <h2>A private invitation is required</h2>
        <p>Ask your employer for a new invitation link, then open it to set up your work account.</p>
        <Link href="/staff/login">Go to staff sign-in <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </div>
    );
  }

  return <EmployeeInvitationForm invite={invite} confirmed={confirmed === '1'} />;
}

export default function EmployeeInvitePage({ searchParams }: { searchParams: InvitationParams }) {
  return (
    <main className="gr-auth gr-auth--staff gr-staff-invite">
      <header className="gr-invite-topbar">
        <Link href="/" className="gr-invite-brand" aria-label="Golden Rose Perfume home">
          <span className="gr-invite-brand-mark">
            <Image src="/assets/brand/golden-rose-logo.png" alt="" width={1188} height={1324} sizes="45px" />
          </span>
          <span className="gr-invite-brand-copy"><strong>Golden Rose</strong><small>STAFF WORKSPACE</small></span>
        </Link>
        <Link href="/staff/login" className="gr-invite-back"><ArrowLeft size={16} aria-hidden="true" /> Staff sign-in</Link>
      </header>

      <div className="gr-invite-layout">
        <div className="gr-invite-shell">
          <aside className="gr-invite-visual" aria-label="Golden Rose staff onboarding">
            <Image
              src="/assets/products/telegram-selected/gr-3bed367cf5c0.jpg"
              alt=""
              fill
              sizes="(max-width: 900px) 0px, 42vw"
              className="gr-invite-visual-photo"
              priority
            />
            <div className="gr-invite-visual-shade" />
            <div className="gr-invite-visual-top"><ShieldCheck size={19} aria-hidden="true" /> PRIVATE TEAM ACCESS</div>
            <div className="gr-invite-visual-bottom">
              <span className="gr-invite-visual-eyebrow">WELCOME TO THE TEAM</span>
              <h2>Your next chapter starts here.</h2>
              <p>One secure workspace for the people behind Golden Rose Perfume.</p>
              <span className="gr-invite-visual-signature">GOLDEN ROSE / STAFF</span>
            </div>
          </aside>

          <section className="gr-invite-card" aria-labelledby="employee-invitation-title">
            <div className="gr-invite-badge"><span aria-hidden="true" /> TEAM ONBOARDING</div>
            <h1 id="employee-invitation-title">Accept your <em>employee invitation.</em></h1>
            <p className="gr-invite-lead">Use the work email named in your invitation. Create a password for a new account, or sign in with an existing one.</p>
            <Suspense fallback={<p className="gr-invite-loading" role="status">Loading invitation…</p>}>
              <Invitation searchParams={searchParams} />
            </Suspense>
            <div className="gr-invite-bottom-note">
              <LockKeyhole size={15} aria-hidden="true" />
              <span>Invitation links are private. Only use a link sent by your employer.</span>
            </div>
          </section>
        </div>
        <footer className="gr-invite-footer">
          <span>Golden Rose Perfume · Internal business access</span>
          <Link href="/staff/login">Already onboarded? Sign in <ArrowUpRight size={13} aria-hidden="true" /></Link>
        </footer>
      </div>
    </main>
  );
}
