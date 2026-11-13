
import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from 'lucide-react';

import { CustomerAccountShell } from '@/src/components/customer-account-shell';
import { CustomerThemePreference } from '@/src/components/theme-provider';
import { CustomerSignOut } from '@/src/components/customer-auth-form';
import { requireCustomer } from '@/src/lib/customer/session';

export const metadata: Metadata = {
  title: 'Account Settings — Golden Rose Perfume',
};

export default function AccountSettingsPage() {
  return <Suspense fallback={<p className="grc-loading" role="status">Loading your settings…</p>}>
    <AccountSettings />
  </Suspense>;
}

async function AccountSettings() {
  const customer = await requireCustomer();

  return (
    <CustomerAccountShell
      active="settings"
      name={customer.name}
    >
      <div className="grc-page">
        <header className="grc-page__heading">
          <p className="grc-eyebrow">
            YOUR PRIVATE BOUTIQUE
          </p>

          <h1>Account settings.</h1>

          <p>
            Your Golden Rose account, your personal
            preferences, and the little details
            that make the experience yours.
          </p>
        </header>

        <div className="grc-settings-grid">
          {/* CUSTOMER INFORMATION */}
          <section className="grc-panel">
            <div className="grc-panel__heading">
              <UserRound
                size={23}
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <h2>Personal details</h2>
            </div>

            <dl className="grc-detail-list">
              <div>
                <dt>Customer name</dt>
                <dd>{customer.name || 'Not provided'}</dd>
              </div>

              <div>
                <dt>Signed-in email address</dt>
                <dd>
                  {customer.email || 'Not available'}
                </dd>
              </div>
            </dl>

            <p style={{ marginTop: 22 }}>
              Your account details are linked to your
              Golden Rose customer login.
            </p>
          </section>

          {/* ACCOUNT SECURITY */}
          <section className="grc-panel">
            <div className="grc-panel__heading">
              <LockKeyhole
                size={23}
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <h2>Account security</h2>
            </div>

            <p>
              Keep your account secure. If you need
              a new password, request a secure reset
              through the existing account recovery flow.
            </p>

            <Link
              href="/account/forgot-password"
              className="grc-panel__action"
            >
              Reset my password
              <ArrowRight
                size={15}
                aria-hidden="true"
              />
            </Link>
          </section>

          {/* THEME PREFERENCES */}
          <section className="grc-panel grc-panel--wide">
            <CustomerThemePreference appearance={customer.appearance} />
          </section>

          {/* PRIVATE SESSION */}
          <section className="grc-panel grc-panel--wide">
            <div className="grc-panel__heading">
              <ShieldCheck
                size={23}
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <h2>Your session</h2>
            </div>

            <p>
              You are signed in to your personal
              Golden Rose account. Signing out will
              end this session on the current device.
            </p>

            <div className="grc-settings-signout">
              <CustomerSignOut />
            </div>
          </section>
        </div>
      </div>
    </CustomerAccountShell>
  );
}
