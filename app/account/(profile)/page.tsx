import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import {
  getCustomer,
} from '@/src/lib/customer/session';

async function AccountEntry(): Promise<never> {
  const customer = await getCustomer().catch(
    () => undefined,
  );

  if (customer === undefined) {
    return redirect(
      '/account/login?notice=unavailable',
    );
  }

  if (!customer) {
    return redirect('/account/login');
  }

  return redirect('/account/dashboard');
}

export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <div
          className="grid min-h-[60vh] place-items-center px-5"
          role="status"
        >
          Opening your Golden Rose account…
        </div>
      }
    >
      <AccountEntry />
    </Suspense>
  );
}