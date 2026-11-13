import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/src/lib/golden-rose/staff';
import { canImportData } from '@/src/lib/imports/model';
import { MigrationCentre } from './migration-centre';
import './page.css';

async function OwnerMigrationCentre() {
  const { role } = await requireStaff();
  if (!canImportData(role)) notFound();
  return <MigrationCentre />;
}

export default function MigrationPage() {
  return <Suspense fallback={<p role="status">Verifying access to data management…</p>}>
    <OwnerMigrationCentre />
  </Suspense>;
}
