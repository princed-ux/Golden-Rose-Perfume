import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { getStaffPasswordState } from '@/src/lib/golden-rose/staff';
import { ChangeEmployeePasswordForm } from './form';

async function PasswordChange() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user?.email_confirmed_at || await getStaffPasswordState(client) !== 'change_required') redirect('/staff/login');
  return <ChangeEmployeePasswordForm />;
}

export default function StaffChangePasswordPage() {
  return <main className="grid min-h-dvh place-items-center bg-[#211315] p-4 text-[#fff7e9]">
    <section className="grid w-full max-w-md gap-5 rounded-2xl border border-[#8b6a45] bg-[#321b22] p-6 shadow-xl sm:p-9">
      <p className="text-xs font-semibold tracking-widest text-[#e1bf7d] uppercase">Golden Rose · Staff access</p>
      <h1 className="font-serif text-3xl">Set your own password</h1>
      <p className="text-sm leading-6 text-[#eddcc9]">Replace your temporary password, then sign in again to access your assigned workspace.</p>
      <Suspense fallback={<p role="status">Checking staff session…</p>}><PasswordChange /></Suspense>
      <Link className="w-fit text-sm text-[#f4d59b] underline underline-offset-4" href="/staff/login">Back to staff sign-in</Link>
    </section>
  </main>;
}
