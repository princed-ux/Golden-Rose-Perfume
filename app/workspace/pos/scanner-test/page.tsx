
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/src/lib/golden-rose/staff';
import { canViewModule } from '@/src/domain/permissions';
import { BarcodeScannerTest } from './scanner-client';
import './scanner-test.css';

export const metadata: Metadata = {
  title: 'Barcode Scanner Test | Golden Rose',
};

export default async function BarcodeScannerTestPage() {
  const { role } = await requireStaff();

  if (!canViewModule(role, 'pos')) {
    notFound();
  }

  return <BarcodeScannerTest />;
}
