import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { WorkspacePreview } from '@/src/components/workspace/workspace-shell';

export const metadata: Metadata = {
  title: 'Owner Suite Preview',
  robots: { index: false, follow: false },
};

export default function OwnerPreviewPage() {
  if (process.env.NODE_ENV !== 'development') return notFound();
  return <WorkspacePreview />;
}
