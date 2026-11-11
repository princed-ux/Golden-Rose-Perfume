import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Account settings' };

export default function AccountSettingsPage() {
  return (
    <div className="flex flex-col items-start gap-6">
      <span className="overline">CUSTOMER ACCOUNT</span>
      <h1 className="text-3xl">Account settings</h1>
      <p className="max-w-2xl text-sm leading-7 text-[#77706c]">
        Manage your personal details and preferences when customer accounts become available.
      </p>
      <dl className="grid w-full gap-6 rounded border border-[#e9e3db] p-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <dt className="font-medium">Profile and contact details</dt>
          <dd className="text-sm leading-6 text-[#77706c]">Name and contact information will be available after sign-in.</dd>
        </div>
        <div className="flex flex-col gap-2">
          <dt className="font-medium">Communication preferences</dt>
          <dd className="text-sm leading-6 text-[#77706c]">Account preferences will be available after sign-in.</dd>
        </div>
      </dl>
      <p className="text-sm text-[#77706c]">This preview does not collect or save personal information.</p>
      <Link href="/account" className="text-link">Back to your account</Link>
    </div>
  );
}
