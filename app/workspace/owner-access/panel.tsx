import { WorkspaceNotice, WorkspacePanel } from '@/src/components/workspace/page-layout';
import { createClient } from '@/src/lib/supabase/server';
import Link from 'next/link';
import { OwnerAccessButton, OwnerInviteForm } from './forms';

type AccessList = {
  owners: { id: string; email: string; status: 'active' | 'suspended' }[];
  invitations: { id: string; email: string; expiresAt: string }[];
  audit: { id: number; action: string; actor: string | null; subject: string; at: string }[];
};

const title = 'font-serif text-xl font-normal text-[#41172a] sm:text-2xl';

export async function OwnerAccessPanel({ userId }: { userId: string }) {
  const client = await createClient();
  const { data, error } = await client.rpc('gr_owner_access', { p_action: 'list' });
  if (error || !data) return <WorkspacePanel>
    <WorkspaceNotice title="Owner access unavailable" tone={error?.code === 'PGRST202' ? 'pending' : 'error'}>
      {error?.code === 'PGRST202' ? 'Owner management needs its approved database migration.' : 'Could not load owner access. Refresh and try again.'}
    </WorkspaceNotice>
  </WorkspacePanel>;

  const { owners, invitations, audit } = data as AccessList;
  const time = new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' });
  return <div className="grid min-w-0 gap-5">
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <WorkspacePanel label="owners-title" className="grid content-start gap-4">
        <h3 id="owners-title" className={title}>Owner accounts</h3>
        <ul className="grid gap-3">{owners.map(owner => <li key={owner.id}
          className="grid min-w-0 gap-3 rounded-lg border border-[#eaded7] bg-white p-4 break-words">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <strong className="min-w-0">{owner.email}</strong>
            <span className={'rounded-full px-2.5 py-1 text-xs font-semibold capitalize ' + (owner.status === 'active'
              ? 'bg-[#e6f1e8] text-[#2d5b3c]' : 'bg-[#fff0d8] text-[#69461b]')}>{owner.status}</span>
          </div>
          {owner.id === userId ? <span className="text-xs text-[#6d5b64]">Your account</span> :
            <div className="flex flex-wrap gap-2">
              <OwnerAccessButton operation={owner.status === 'active' ? 'suspend' : 'restore'} id={owner.id}
                label={owner.status === 'active' ? 'Suspend owner access' : 'Restore owner access'} />
              {owner.status === 'suspended' && <OwnerAccessButton operation="remove" id={owner.id} label="Revoke owner access" />}
            </div>}
        </li>)}</ul>
      </WorkspacePanel>

      <WorkspacePanel label="owner-invite-title" className="grid content-start gap-4">
        <h3 id="owner-invite-title" className={title}>Invite an owner</h3>
        <p className="text-sm leading-6 text-[#6d5b64]">The recipient needs their own confirmed Golden Rose account. Share their code privately and send them to the{' '}
          <Link className="font-semibold text-[#54213a] underline underline-offset-2" href="/staff/accept-invite">owner invitation page</Link>.</p>
        <OwnerInviteForm />
      </WorkspacePanel>
    </div>

    <div className="grid min-w-0 gap-5 xl:grid-cols-2">
      <WorkspacePanel label="owner-invites-title" className="grid content-start gap-4">
        <h3 id="owner-invites-title" className={title}>Pending owner invitations</h3>
        {invitations.length ? <ul className="grid gap-3">{invitations.map(invite => <li key={invite.id} className="grid min-w-0 gap-2 border-b border-[#e8dcd7] pb-3 break-words">
          <strong>{invite.email}</strong><span className="text-xs text-[#6d5b64]">Expires {time.format(new Date(invite.expiresAt))} WAT</span>
          <OwnerAccessButton id={invite.id} operation="revoke" label="Revoke invitation" />
        </li>)}</ul> : <p className="text-sm text-[#6d5b64]">No pending owner invitations.</p>}
      </WorkspacePanel>
      <WorkspacePanel label="owner-audit-title" className="grid content-start gap-4">
        <h3 id="owner-audit-title" className={title}>Owner access history</h3>
        {audit.length ? <ul className="divide-y divide-[#e8dcd7]">{audit.map(event => <li key={event.id} className="grid min-w-0 gap-1 py-3 break-words first:pt-0">
          <strong className="capitalize">{event.action.replaceAll('_', ' ')}</strong>
          <span className="text-sm">{owners.find(owner => owner.id === event.subject)?.email ?? event.subject}</span>
          <span className="text-xs text-[#6d5b64]">{owners.find(owner => owner.id === event.actor)?.email ?? event.actor ?? 'Database operator'} · {time.format(new Date(event.at))} WAT</span>
        </li>)}</ul> : <p className="text-sm text-[#6d5b64]">No owner access events recorded.</p>}
      </WorkspacePanel>
    </div>
  </div>;
}
