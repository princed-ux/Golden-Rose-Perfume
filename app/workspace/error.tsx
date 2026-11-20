
'use client';

import { useEffect } from 'react';

import {
  StaffAccessUnavailable,
} from '@/src/components/workspace/access-unavailable';

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      '[Golden Rose workspace] Rendering failed',
      {
        type: error.name,
        digest: error.digest ?? null,
      },
    );
  }, [error]);

  return (
    <StaffAccessUnavailable retry={reset} />
  );
}