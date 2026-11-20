import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import type { OperationResult } from './golden-rose/contracts';

class ActionOutcome extends Error {
  constructor(readonly result: OperationResult) { super(result.message); }
}

export function actionOutcome(result: OperationResult): never { throw new ActionOutcome(result); }

export async function withActionFeedback(work: () => Promise<OperationResult | void>): Promise<OperationResult> {
  try {
    return await work() ?? {status:'error',message:'The server did not confirm the change. Check the latest records before retrying.'};
  } catch (error) {
    if (error instanceof ActionOutcome) return error.result;
    unstable_rethrow(error); // Genuine authentication redirects and notFound must propagate.
    return {status:'error', message:error instanceof Error && error.name === 'StaffAccessUnavailableError'
      ? 'Staff verification is temporarily unavailable. Your entries have been kept; retry without signing out.'
      : 'The service could not confirm this change. Your entries have been kept. Check the latest records before retrying.'};
  }
}
