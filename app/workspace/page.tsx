
import { redirect } from 'next/navigation';
import { requireStaff } from '@/src/lib/golden-rose/staff';

export default async function WorkspaceOverview() {
  const { role } = await requireStaff();

  if (role === 'cashier') {
    redirect('/workspace/pos');
  }

  return (
    <span className="owner-sr-only">
      Executive overview. Verified business performance
      appears when reporting data is available.
    </span>
  );
}
