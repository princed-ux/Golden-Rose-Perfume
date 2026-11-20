
import type { ReactNode } from 'react';

import {
  WorkspaceNotice,
  WorkspacePanel,
  workspaceInput,
  workspaceLabel,
  workspacePrimary,
  workspaceSecondary,
} from '@/src/components/workspace/page-layout';

export {
  WorkspacePanel,
  WorkspaceNotice,
  workspaceInput,
  workspaceLabel,
  workspacePrimary,
  workspaceSecondary,
};

export const resultText: Record<string, string> = {
  saved: 'The database confirmed the change.',
  invalid:
    'Invalid details or the record is no longer editable. Review the form and refresh.',
  duplicate:
    'An entry with the same supplier name, SKU or reference already exists.',
  forbidden:
    'Your staff role or assigned location does not permit this operation.',
  unavailable:
    'The operations service could not confirm this change. Refresh before retrying.',
};

export function ActionMessage({
  result,
}: {
  result?: string;
}) {
  if (
    !result ||
    !Object.prototype.hasOwnProperty.call(
      resultText,
      result,
    )
  ) {
    return null;
  }

  return (
    <WorkspaceNotice
      title={
        result === 'saved'
          ? 'Saved'
          : 'Action not completed'
      }
      tone={
        result === 'saved'
          ? 'neutral'
          : 'error'
      }
    >
      {resultText[result]}
    </WorkspaceNotice>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className={workspaceLabel}>
      {label}
      {children}
    </label>
  );
}
