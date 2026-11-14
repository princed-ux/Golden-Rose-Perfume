import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { canViewModule } from '@/src/domain/permissions';
import { requireStaff } from '@/src/lib/golden-rose/staff';
import { loadRegisterProducts } from './actions';
import { PosRegister } from './register';
import type { RegisterCatalog } from './types';
import './pos.css';

export const metadata: Metadata = {
  title: 'Point of Sale — Golden Rose Business',
  description: 'Authorized in-store cash selling, barcode product lookup and receipts.',
};

export default async function PointOfSalePage() {
  const { role } = await requireStaff();
  if (!canViewModule(role, 'pos')) notFound();

  let initial: RegisterCatalog = {
    items: [], locations: [], selectedLocationId: null, hasMore: false,
  };
  let error: string | null = null;
  try {
    initial = await loadRegisterProducts();
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'The register is unavailable.';
  }

  return <PosRegister initial={initial} initialError={error} role={role} />;
}
