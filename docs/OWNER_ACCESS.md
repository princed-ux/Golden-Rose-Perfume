# Golden Rose owner access

## First owner

1. Review the owner-access migration and apply it to staging. Run the isolated authorization tests before applying the reviewed SQL to Supabase project `eixbmsethgrtezhdmgsh`.
2. Ask the intended owner to create their own password-based Golden Rose account and confirm their email through the existing Auth flow. Verify their identity out of band. In Supabase Authentication → Users, match the exact confirmed email to its Auth UUID.
3. A privileged database operator runs the following once in the SQL editor for the target project. Replace all three placeholders with the verified recipient UUID, their confirmed address, and a reference to the owner's approval. The function rejects a second bootstrap even after an owner is removed.

```sql
select golden_rose_access.bootstrap_owner(
  '<verified-auth-user-uuid>'::uuid,
  '<verified-email>',
  '<approval-reference>'
);
```

4. The recipient signs in at `/staff/login` using their own password. Confirm the displayed role is Owner and that Staff & Permissions and Data Management appear. Staff status is read from `golden_rose.staff_members` on every protected server request. An Auth account alone has no business role.

## Additional owners

1. The recipient independently creates and confirms a password-based account. Use a separate email and password for each person.
2. An active owner opens **Workspace → Staff & Permissions → Invite an owner**, selects the recipient's exact confirmed email, and shares the generated code through a private, verified channel. The app does not send email. The code expires after 24 hours and is stored only as a hash.
3. The recipient visits `/staff/accept-invite`, signs in with that account, and enters the code. Acceptance requires both the invited Auth UUID and the current confirmed email. The invitation is consumed atomically with the owner grant. Both owners access the same business.
4. An active owner can revoke a pending code or suspend another owner. Suspension blocks workspace and import authorization and revokes unused invitations issued by that owner. An active owner can restore or permanently revoke a suspended membership. A revoked owner needs a fresh invitation. The app blocks self-suspension and self-revocation so an active owner remains. If all owners lose access, use a separately approved, audited database recovery. The bootstrap remains consumed.

The owner page shows recent access history. The private audit table records grants, removals, suspensions, restorations, invitation events, and the bootstrap approval reference. Supabase Auth passwords, email verification, and recovery stay in the existing authentication flow. Use the site's established secure account recovery process for individual credentials.

## Import activation

Install the separately reviewed [import migration](../supabase/migrations/20261112200714_bulk_data_import_foundation.sql). Configure `SUPABASE_IMPORT_SECRET_KEY` as a server-only Supabase secret key for this project. The browser keeps using the existing publishable key and staff cookies. Restrict the secret to the application runtime and rotate it if exposed. A staging test must cover real Supabase private object upload and resume before the first business import.

The SQL exposes invoker wrappers with explicit grants and keeps privileged implementations in unexposed schemas. Read or write access to private import files is server-only. The import function verifies the actor against the current active owner membership. [Supabase API keys](https://supabase.com/docs/guides/api/api-keys) · [Database functions](https://supabase.com/docs/guides/database/functions) · [Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
