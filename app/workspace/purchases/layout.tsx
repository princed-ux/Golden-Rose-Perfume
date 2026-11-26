
import Link from 'next/link';
import type { ReactNode } from 'react';

const links = [
  {
    href: '/workspace/purchases',
    label: 'Purchase orders',
  },
  {
    href: '/workspace/purchases/package-orders',
    label: 'Pack & carton purchasing',
  },
  {
    href: '/workspace/purchases/packaging',
    label: 'Packaging & Units',
  },
];

export default function PurchasesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-5">
      <nav
        aria-label="Purchasing sections"
        className="flex flex-wrap gap-2"
      >
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="inline-flex min-h-10 items-center rounded-xl border border-gr-border bg-gr-surface px-4 py-2 text-sm font-semibold text-gr-gold transition hover:border-gr-gold hover:bg-gr-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gr-gold"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
