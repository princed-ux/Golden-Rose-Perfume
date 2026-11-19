
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  Mail,
  ShieldCheck,
  Store,
  UsersRound,
} from 'lucide-react';

import {
  WorkspaceNotice,
  WorkspacePageHeader,
  WorkspacePanel,
} from '@/src/components/workspace/page-layout';

import { resolveAuthOrigin } from '@/src/lib/customer/auth-policy';

import type {
  EmployeeAccountSetupIssue,
  EmployeeAccountState,
  StaffDirectory,
} from '@/src/lib/golden-rose/employees';

import { requireStaff } from '@/src/lib/golden-rose/staff';
import { createClient } from '@/src/lib/supabase/server';

import {
  employeeAdminClient,
  employeeEmailConfirmation,
} from '@/src/lib/golden-rose/employee-admin';

import { OwnerAccessPanel } from '../owner-access/panel';
import {
  StaffManagement,
  StaffSectionLinks,
} from './staff-management';

export const metadata: Metadata = {
  title: 'Staff Management | Golden Rose Perfume',
  description:
    'Employee access, permissions, business owners and onboarding readiness.',
};

type ReadinessItem = {
  label: string;
  detail: string;
  ok: boolean;
  optional?: boolean;
};

function ReadinessPanel({
  items,
  directory,
}: {
  items: ReadinessItem[];
  directory: StaffDirectory | null;
}) {
  const required = items.filter((item) => !item.optional);
  const passed = required.filter((item) => item.ok).length;
  const ready = passed === required.length;

  const activeEmployees =
    directory?.employees.filter(
      (item) => item.status === 'active',
    ).length ?? 0;

  const pendingInvites =
    directory?.invitations.filter(
      (item) => item.status === 'pending',
    ).length ?? 0;

  const activeStores =
    directory?.locations.filter(
      (item) => item.active,
    ).length ?? 0;

  return (
    <WorkspacePanel>
      <div className="grid gap-4" id="staff-readiness">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#a07a46]">
              Owner controls
            </p>

            <h2 className="mt-1 font-serif text-2xl text-[#441d30]">
              Staff setup &amp; security
            </h2>

            <p className="mt-1 max-w-2xl text-sm text-[#806a75]">
              Live configuration checks, not a simulated
              employee test. No accounts or passwords are
              changed by opening this panel.
            </p>
          </div>

          <div
            className={
              'rounded-lg px-3 py-2 text-sm font-semibold ' +
              (ready
                ? 'bg-[#e6f3e9] text-[#28623e]'
                : 'bg-[#fff2dc] text-[#805622]')
            }
          >
            {passed} / {required.length} required checks passed
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              label: 'Active employees',
              value: activeEmployees,
              Icon: UsersRound,
            },
            {
              label: 'Active stores',
              value: activeStores,
              Icon: Store,
            },
            {
              label: 'Pending invitations',
              value: pendingInvites,
              Icon: Mail,
            },
          ].map(({ label, value, Icon }) => (
            <div
              className="flex items-center gap-3 rounded-xl border border-[#ecdfd9] bg-[#fffdfa] p-3"
              key={label}
            >
              <Icon
                size={20}
                className="text-[#91633e]"
                aria-hidden="true"
              />

              <span className="grid gap-0.5">
                <strong className="text-lg text-[#4a2437]">
                  {directory ? value : '—'}
                </strong>

                <small className="text-[#78656f]">
                  {label}
                </small>
              </span>
            </div>
          ))}
        </div>

        <ul className="grid gap-2 md:grid-cols-2">
          {items.map((item) => (
            <li
              key={item.label}
              className="flex items-start gap-3 rounded-xl border border-[#ecdfd9] bg-white p-3"
            >
              {item.ok ? (
                <CheckCircle2
                  size={18}
                  className="mt-0.5 shrink-0 text-[#2c8253]"
                  aria-hidden="true"
                />
              ) : (
                <CircleAlert
                  size={18}
                  className="mt-0.5 shrink-0 text-[#a16924]"
                  aria-hidden="true"
                />
              )}

              <span className="grid gap-1">
                <strong className="text-sm text-[#47283a]">
                  {item.label}
                  {item.optional ? ' · Optional' : ''}
                </strong>

                <small className="leading-5 text-[#78656f]">
                  {item.detail}
                </small>
              </span>
            </li>
          ))}
        </ul>

        <p className="flex items-start gap-2 text-xs leading-5 text-[#785e6c]">
          <ShieldCheck
            size={16}
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          />

          {ready
            ? 'Configuration checks passed. Complete real staff invitation, login, role and suspension acceptance before release.'
            : 'Resolve the required configuration issues before creating or activating client employee accounts.'}
        </p>

        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            className="font-semibold text-[#672b49] underline underline-offset-4"
            href="/workspace/inventory"
          >
            Manage live store locations
          </Link>

          <Link
            className="font-semibold text-[#672b49] underline underline-offset-4"
            href="/staff/employee-invite"
          >
            Employee invitation page
          </Link>
        </div>
      </div>
    </WorkspacePanel>
  );
}

async function EmployeeDirectory({
  userId,
}: {
  userId: string;
}) {
  const client = await createClient();

  const [
    { data, error },
    passwordProbe,
  ] = await Promise.all([
    client.rpc('gr_staff_manage', {
      p_action: 'list',
    }),
    client.rpc('gr_employee_password_state'),
  ]);

  const directory =
    !error &&
    data &&
    Array.isArray(data.employees) &&
    Array.isArray(data.locations) &&
    Array.isArray(data.invitations) &&
    Array.isArray(data.audit)
      ? (data as StaffDirectory)
      : null;

  const admin = directory
    ? employeeAdminClient()
    : null;

  const [
    credentials,
    emailConfirmation,
  ] = await Promise.all([
    admin
      ? admin.rpc('gr_owner_employee_account', {
          p_owner: userId,
          p_action: 'list',
        })
      : null,

    directory
      ? employeeEmailConfirmation()
      : null,
  ]);

  const accountStates =
    credentials &&
    !credentials.error &&
    credentials.data &&
    typeof credentials.data === 'object' &&
    !Array.isArray(credentials.data)
      ? (credentials.data as Record<
          string,
          EmployeeAccountState
        >)
      : null;

  const accountSetupIssues: EmployeeAccountSetupIssue[] =
    [];

  if (directory && !admin) {
    accountSetupIssues.push('server-key');
  }

  if (
    passwordProbe.error?.code === 'PGRST202' ||
    credentials?.error?.code === 'PGRST202'
  ) {
    accountSetupIssues.push('migration');
  }

  if (admin && !accountStates) {
    accountSetupIssues.push('connection');
  }

  if (emailConfirmation === 'disabled') {
    accountSetupIssues.push('email-confirmation');
  }

  if (emailConfirmation === 'unavailable') {
    accountSetupIssues.push('auth-settings');
  }

  const passwordCheck =
    !passwordProbe.error &&
    passwordProbe.data === 'none';

  const siteUrlReady = Boolean(
    resolveAuthOrigin(
      process.env.NEXT_PUBLIC_SITE_URL,
      null,
    ),
  );

  const autoInviteEmailReady = Boolean(
    process.env.RESEND_API_KEY?.trim() &&
      process.env.STAFF_INVITE_FROM?.trim(),
  );

  const storeCount =
    directory?.locations.filter(
      (location) => location.active,
    ).length ?? 0;

  const items: ReadinessItem[] = [
    {
      label: 'Staff directory and permissions',
      ok: directory !== null,
      detail: directory
        ? 'Employee roles, assignments, invitations and audit events are available.'
        : 'The employee directory could not be read. Check the active staff session and migration.',
    },
    {
      label: 'Password-enrollment gate',
      ok: passwordCheck,
      detail: passwordCheck
        ? 'The server can verify password-enrollment state for this active owner session.'
        : 'Password-enrollment verification failed. Staff workspace access must remain blocked until resolved.',
    },
    {
      label: 'Owner-controlled account provisioning',
      ok: accountStates !== null,
      detail:
        accountStates !== null
          ? 'Privileged account provisioning is available from the server only.'
          : 'Configure SUPABASE_STAFF_ADMIN_SECRET_KEY on the trusted web server and verify the account RPC.',
    },
    {
      label: 'Work-email confirmation',
      ok: emailConfirmation === 'required',
      detail:
        emailConfirmation === 'required'
          ? 'Employee sign-up requires a verified work email.'
          : 'Check Supabase Auth email confirmation and the Auth settings connection.',
    },
    {
      label: 'Active selling location',
      ok: storeCount > 0,
      detail:
        storeCount > 0
          ? `${storeCount} active store${
              storeCount === 1 ? '' : 's'
            } can be assigned to employees.`
          : 'Create and activate a store location before assigning employees.',
    },
    {
      label: 'Public website URL',
      ok: siteUrlReady,
      detail: siteUrlReady
        ? 'A configured site origin is available for employee invitation links.'
        : 'Set NEXT_PUBLIC_SITE_URL to the business HTTPS origin for production invitations.',
    },
    {
      label: 'Automatic staff invitation emails',
      ok: autoInviteEmailReady,
      optional: true,
      detail: autoInviteEmailReady
        ? 'Email sending credentials are configured; delivery still needs a live acceptance test.'
        : 'Set RESEND_API_KEY and STAFF_INVITE_FROM to send invitations automatically, or share private invitation links.',
    },
  ];

  return (
    <div className="grid gap-5">
      <ReadinessPanel
        items={items}
        directory={directory}
      />

      <StaffManagement
        directory={directory}
        accountStates={accountStates}
        accountSetupIssues={accountSetupIssues}
        unavailable={
          error?.code === 'PGRST202'
            ? 'pending'
            : 'error'
        }
      />
    </div>
  );
}

export default async function StaffManagementPage() {
  const { role, userId } = await requireStaff();

  if (role !== 'owner') {
    notFound();
  }

  return (
    <div className="grid min-w-0 gap-7">
      <Suspense
        fallback={
          <div className="grid gap-5">
            <WorkspacePageHeader
              title="Staff & Permissions"
              kicker="Team & access"
            />

            <StaffSectionLinks />

            <WorkspacePanel>
              <WorkspaceNotice title="Loading employees…">
                Retrieving staff access and store assignments.
              </WorkspaceNotice>
            </WorkspacePanel>
          </div>
        }
      >
        <EmployeeDirectory userId={userId} />
      </Suspense>

      <section
        id="staff-owners"
        className="grid min-w-0 scroll-mt-24 gap-5 border-t border-[#e8dcd7] pt-1"
        aria-labelledby="grstaff-owner-title"
      >
        <WorkspacePageHeader
          id="grstaff-owner-title"
          level="h2"
          title="Business Owners"
          description="Manage the accounts that hold owner access to Golden Rose."
        />

        <Suspense
          fallback={
            <WorkspacePanel>
              <WorkspaceNotice title="Loading owner access…">
                Retrieving business owner accounts.
              </WorkspaceNotice>
            </WorkspacePanel>
          }
        >
          <OwnerAccessPanel userId={userId} />
        </Suspense>
      </section>
    </div>
  );
}
