
import type { ReactNode } from 'react';
import Link from 'next/link';
import { BarChart3, ClipboardCheck } from 'lucide-react';

/**
 * Navigation only. The child pages independently verify staff roles.
 * Existing Reports & Analytics functionality is not replaced.
 */
export default function ReportsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-5">
      <nav aria-label="Financial report views" className="flex flex-wrap gap-2">
        <Link
          href="/workspace/reports"
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gr-border bg-gr-surface px-4 text-sm font-semibold text-gr-text hover:bg-gr-surface-alt"
        >
          <BarChart3 size={17} aria-hidden="true" />
          Reports &amp; Analytics
        </Link>
        <Link
          href="/workspace/reports/reconciliation"
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gr-border bg-gr-surface px-4 text-sm font-semibold text-gr-text hover:bg-gr-surface-alt"
        >
          <ClipboardCheck size={17} aria-hidden="true" />
          Financial reconciliation
        </Link>
      </nav>
      {children}
    </div>
  );
}
