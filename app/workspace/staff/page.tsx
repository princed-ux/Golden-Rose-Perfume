
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { requireStaff } from '@/src/lib/golden-rose/staff';
import { OwnerAccessPanel } from '../owner-access/panel';
import { StaffManagement } from './staff-management';

import './staff.css';

export const metadata: Metadata = {
  title: 'Staff Management | Golden Rose Perfume',
  description:
    'Employee access, permissions and business owner management.',
};

export default async function StaffManagementPage() {
  const { role, userId } = await requireStaff();

  if (role !== 'owner') {
    notFound();
  }

  return (
    <div className="grstaff">
      <StaffManagement />

      <section
        className="grstaff-owner-section"
        aria-labelledby="grstaff-owner-title"
      >
        <div className="grstaff-section-heading">
          <div>
            <p className="grstaff-eyebrow">
              BUSINESS OWNERSHIP
            </p>

            <h2 id="grstaff-owner-title">
              Business owners
            </h2>

            <p>
              Manage separately authorized owner accounts,
              including access for a second business owner.
            </p>
          </div>
        </div>

        <OwnerAccessPanel userId={userId} />
      </section>
    </div>
  );
}
