import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { WorkspaceNotice, WorkspacePageHeader, WorkspacePanel } from '@/src/components/workspace/page-layout';
import type { StaffDirectory } from '@/src/lib/golden-rose/employees';
import { requireStaff } from '@/src/lib/golden-rose/staff';
import { createClient } from '@/src/lib/supabase/server';
import { OwnerAccessPanel } from '../owner-access/panel';
import { StaffManagement, StaffSectionLinks } from './staff-management';

export const metadata: Metadata = {
  title: 'Staff Management | Golden Rose Perfume',
  description: 'Employee access, permissions and business owner management.',
};

async function EmployeeDirectory() {
  const client = await createClient();
  const { data, error } = await client.rpc('gr_staff_manage', { p_action: 'list' });
  const directory = !error && data && Array.isArray(data.employees) && Array.isArray(data.locations) &&
    Array.isArray(data.invitations) && Array.isArray(data.audit) ? data as StaffDirectory : null;
  return <StaffManagement directory={directory} unavailable={error?.code === 'PGRST202' ? 'pending' : 'error'} />;
}

export default async function StaffManagementPage() {
  const { role, userId } = await requireStaff();
  if (role !== 'owner') notFound();

  return <div className="grid min-w-0 gap-7">
    <Suspense fallback={<div className="grid gap-5">
      <WorkspacePageHeader title="Staff & Permissions" kicker="Team & access" />
      <StaffSectionLinks />
      <WorkspacePanel><WorkspaceNotice title="Loading employees…">Retrieving staff access and store assignments.</WorkspaceNotice></WorkspacePanel>
    </div>}>
      <EmployeeDirectory />
    </Suspense>
    <section id="staff-owners" className="grid min-w-0 scroll-mt-24 gap-5 border-t border-[#e8dcd7] pt-1" aria-labelledby="grstaff-owner-title">
      <WorkspacePageHeader id="grstaff-owner-title" level="h2" title="Business Owners"
        description="Manage the accounts that hold owner access to Golden Rose." />
      <Suspense fallback={<WorkspacePanel><WorkspaceNotice title="Loading owner access…">Retrieving business owner accounts.</WorkspaceNotice></WorkspacePanel>}>
        <OwnerAccessPanel userId={userId} />
      </Suspense>
    </section>
  </div>;
}
