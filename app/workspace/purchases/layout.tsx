
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
            className="inline-flex min-h-10 items-center rounded-xl border border-[#e4d4c9] bg-white px-4 py-2 text-sm font-semibold text-[#54213a] transition hover:border-[#b68c56] hover:bg-[#fff7ed] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b68c56]"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
