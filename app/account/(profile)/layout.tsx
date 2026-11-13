
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Customer Account — Golden Rose Perfume',
};

export default function AccountProfileLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
