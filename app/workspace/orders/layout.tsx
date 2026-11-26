
import type { ReactNode } from 'react';
import Link from 'next/link';

import {
  ClipboardList,
  MessageCircle,
} from 'lucide-react';

/**
 * Navigation only.
 *
 * Existing POS sales pages, receipts, filters,
 * and database transactions remain unchanged.
 *
 * Each child route performs its own staff
 * authorization checks.
 */
export default function OrdersLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-5">
      <nav
        aria-label="Sales and order tools"
        className="flex flex-wrap gap-2"
      >
        <Link
          href="/workspace/orders"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gr-border bg-gr-surface px-4 text-sm font-semibold text-gr-text hover:bg-gr-surface-alt"
        >
          <ClipboardList
            size={16}
            aria-hidden="true"
          />

          POS sales & receipts
        </Link>

        <Link
          href="/workspace/orders/whatsapp"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gr-border bg-gr-surface px-4 text-sm font-semibold text-gr-text hover:bg-gr-surface-alt"
        >
          <MessageCircle
            size={16}
            aria-hidden="true"
          />

          WhatsApp enquiries
        </Link>
      </nav>

      {children}
    </div>
  );
}
