import { createClient } from '@/src/lib/supabase/server';
import Link from 'next/link';
import { OwnerAccessButton, OwnerInviteForm } from './forms';

type AccessList = {
  owners: { id: string; email: string; status: 'active' | 'suspended' }[];
  invitations: { id: string; email: string; expiresAt: string }[];
  audit: { id: number; action: string; actor: string | null; subject: string; at: string }[];
};

export async function OwnerAccessPanel({ userId }: { userId: string }) {
  const client = await createClient();
  const { data, error } = await client.rpc('gr_owner_access', { p_action: 'list' });
  if (error || !data) return <section className="owner-panel owner-module"><h2>Owner access</h2>
    <p role="status">Owner access management is unavailable. Check that its reviewed database migration is installed.</p></section>;
  const { owners, invitations, audit } = data as AccessList;
  const time = new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' });
  return <div className="workspace-page gr-live">
    <section className="panel gr-live-panel" aria-labelledby="owner-invite-title">
      <h2 id="owner-invite-title">Invite an owner</h2>
      <p>The recipient needs their own confirmed Golden Rose account. Share the code privately and direct them to the <Link className="text-link" href="/staff/accept-invite">staff invitation page</Link>.</p>
      <OwnerInviteForm />
    </section>
    <section className="panel gr-live-panel" aria-labelledby="owners-title">
      <h2 id="owners-title">Owners</h2>
      <ul className="gr-live-locations">{owners.map(owner => <li key={owner.id}>
        <strong>{owner.email}</strong><span>{owner.status}{owner.id === userId ? ' · Your account' : ''}</span>
        {owner.id !== userId && <OwnerAccessButton operation={owner.status === 'active' ? 'suspend' : 'restore'}
          id={owner.id} label={owner.status === 'active' ? 'Suspend owner access' : 'Restore owner access'} />}
        {owner.id !== userId && owner.status === 'suspended' &&
          <OwnerAccessButton operation="remove" id={owner.id} label="Revoke owner access" />}
      </li>)}</ul>
    </section>
    <section className="panel gr-live-panel" aria-labelledby="owner-invites-title">
      <h2 id="owner-invites-title">Pending invitations</h2>
      {invitations.length ? <ul className="gr-live-locations">{invitations.map(invite => <li key={invite.id}>
        <strong>{invite.email}</strong><span>Expires {time.format(new Date(invite.expiresAt))} WAT</span>
        <OwnerAccessButton id={invite.id} operation="revoke" label="Revoke invitation" />
      </li>)}</ul> : <p>No pending owner invitations.</p>}
    </section>
    <section className="panel gr-live-panel" aria-labelledby="owner-audit-title">
      <h2 id="owner-audit-title">Owner access history</h2>
      {audit.length ? <div className="data-table-wrap" tabIndex={0} role="region" aria-label="Owner access history table">
        <table className="data-table gr-live-table">
          <thead><tr><th>Event</th><th>Actor</th><th>Account</th><th>Time (WAT)</th></tr></thead>
          <tbody>{audit.map(event => <tr key={event.id}><td>{event.action.replaceAll('_', ' ')}</td>
            <td>{owners.find(owner => owner.id === event.actor)?.email ?? event.actor ?? 'Database operator'}</td>
            <td>{owners.find(owner => owner.id === event.subject)?.email ?? event.subject}</td>
            <td>{time.format(new Date(event.at))}</td></tr>)}</tbody>
        </table>
      </div> : <p>No owner access events recorded.</p>}
    </section>
  </div>;
}
