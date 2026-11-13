import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthNotice } from '../auth-notice';
import { CustomerAuthLayout } from '../customer-auth-layout';

export const metadata: Metadata = {
  title: 'Welcome Back',
  description: 'Sign in to your Golden Rose Perfume customer account.',
};

export default function LoginPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  return <CustomerAuthLayout mode="login"
    notice={<Suspense><AuthNotice searchParams={searchParams} /></Suspense>}
  />;
}
