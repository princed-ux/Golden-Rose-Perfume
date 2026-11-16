'use client';

import { Printer } from 'lucide-react';
import { workspacePrimary } from '@/src/components/workspace/page-layout';

export function PrintSaleReceipt() {
  return (
    <button
      type="button"
      className={workspacePrimary}
      onClick={() => window.print()}
      aria-label="Print confirmed POS receipt"
    >
      <Printer size={17} aria-hidden="true" />
      Print receipt
    </button>
  );
}
