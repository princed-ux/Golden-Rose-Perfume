
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { canViewModule } from '@/src/domain/permissions';
import { requireStaff } from '@/src/lib/golden-rose/staff';
import { loadPosCatalogue } from './actions';
import { PosRegister } from './register';
import type { PosCatalogue } from './types';
import './pos.css';

export const metadata: Metadata = {
  title: 'Point of Sale | Golden Rose Perfume',
  description:
    'Secure in-store selling, barcode lookup, cash payments and receipts.',
};

/**
 * Dedicated authenticated route.
 * Next.js chooses it before /workspace/[module].
 */
export default function PointOfSalePage() {
  return (
    <Suspense fallback={<p className="p-5 text-sm text-[#6f5162]" role="status">Loading register…</p>}>
      <AuthorizedRegister />
    </Suspense>
  );
}

async function AuthorizedRegister() {
  const { role } = await requireStaff();

  if (!canViewModule(role, 'pos')) {
    notFound();
  }

  let initial: PosCatalogue = {
    items: [],
    locations: [],
    selectedLocationId: null,
    hasMore: false,
  };

  let loadError: string | null = null;

  try {
    initial = await loadPosCatalogue();
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : 'The register is unavailable.';
  }

  return (
    <PosRegister
      initial={initial}
      loadError={loadError}
      role={role}
    />
  );
}
