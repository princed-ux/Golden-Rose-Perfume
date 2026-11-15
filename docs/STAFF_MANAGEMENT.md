# Staff & Permissions

Owners manage employees from **Workspace → Staff Management**. A role and active store are required to issue an invitation. The code expires after 24 hours, is stored as a hash, and only grants access to the matching confirmed Supabase account. Reissuing invalidates the previous link. Employees can keep an existing confirmed account or choose a password and confirm their work email. Usernames are optional directory identifiers. Sign-in uses work email.

The existing owner panel remains independent. Suspending an employee blocks business access; restoring enables the existing membership. Revocation keeps the Auth account and audit history and requires a new invitation to grant access again. Existing employees with no assigned store must be assigned before using location-scoped functions.

## Release order

1. Review the prior POS authorization migration `20261114172002_golden_rose_pos_actor_authorization.sql`. The hosted POS function currently depends on this correction to check confirmed identities without granting direct Auth table access.
2. Review `20261115131653_golden_rose_staff_management.sql`. Apply only the reviewed pending migrations in order. The current deployed staff-session function already forwards the role and store from the SQL response. Deploy the reviewed local POS Edge Function alongside the POS SQL so it recognizes explicit `GR403` denials.
3. Configure `NEXT_PUBLIC_SITE_URL` with the HTTPS app origin. Keep email confirmation enabled in Supabase, allowlist the app's `/auth/callback` redirect, and verify Auth email delivery. For direct invitation email, set server-side `RESEND_API_KEY` and `STAFF_INVITE_FROM` to an authorized sender. Without a sender the owner gets a private link to share. Supabase still verifies mailbox ownership.
4. Assign stores for any existing employees, then use approved test accounts in staging to check invitation email, sign-in, suspension, and a cash transaction before inviting real users.

Desktop POS should use the same Supabase project and email/password authentication with the publishable key. Send the staff user's access token to the existing staff-session and register endpoints. The database enforces role and store scope for each business operation.
