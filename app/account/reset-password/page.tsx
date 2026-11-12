import { Suspense } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';
import { RECOVERY_COOKIE } from '@/src/lib/customer/auth-policy';
import { CustomerAuthForm } from '@/src/components/customer-auth-form';
import '../page.css';

async function ResetForm() {
  await connection();
  const marker = (await cookies()).get(RECOVERY_COOKIE)?.value;
  const claims = marker ? await (await createClient()).auth.getClaims().catch(() => null) : null;
  if (!marker || claims?.data?.claims.session_id !== marker) {
    return <p className="gr-auth-status">Open the link in your reset email, or <Link href="/account/forgot-password">request a new link</Link>.</p>;
  }
  return <CustomerAuthForm mode="reset-password" />;
}

export default function ResetPasswordPage() {
  return (
    <main className="gr-auth">
      <header className="gr-auth-header"><Link href="/" className="gr-auth-brand">Golden Rose Perfume</Link></header>
      <section className="gr-auth-panel" aria-labelledby="reset-title">
        <h1 id="reset-title">Choose a new password.</h1>
        <p className="gr-auth-intro">Set the password you will use to sign in.</p>
        <Suspense fallback={<p role="status">Checking your reset link…</p>}><ResetForm /></Suspense>
      </section>
    </main>
  );
}
