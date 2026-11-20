
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
            className="inline-flex min-h-10 items-center rounded-xl border border-[#e4d5ce] bg-white px-4 py-2 text-sm font-semibold text-[#54213a] transition hover:border-[#b68c56] hover:bg-[#fff7ed]"
          >
            {section.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
