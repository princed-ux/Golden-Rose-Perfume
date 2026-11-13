import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OwnerPrototype } from './owner-prototype';

export const metadata: Metadata = {
  title: 'Owner Suite Preview',
  robots: { index: false, follow: false },
};

export default function OwnerPreviewPage() {
  if (process.env.NODE_ENV !== 'development') return notFound();
  return <OwnerPrototype />;
}
