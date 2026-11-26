
import type { ReactNode } from 'react';
import Link from 'next/link';

const sections = [
  {
    href: '/workspace/migration',
    label: 'Catalogue import',
  },
  {
    href: '/workspace/migration/odoo-sales',
    label: 'Odoo historical sales',
  },
];

export default function MigrationLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-5">
      <nav
        aria-label="Data Management sections"
        className="flex flex-wrap gap-2"
      >
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="inline-flex min-h-10 items-center rounded-xl border border-gr-border bg-gr-surface px-4 py-2 text-sm font-semibold text-gr-text transition hover:border-gr-control-border hover:bg-gr-surface-alt"
          >
            {section.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
