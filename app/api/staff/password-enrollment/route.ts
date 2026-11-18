import { createClient } from '@supabase/supabase-js';
import { newPasswordError } from '@/src/lib/customer/auth-policy';
import { employeeAdminClient, employeeEmailConfirmation, employeePublicAuthClient } from '@/src/lib/golden-rose/employee-admin';
import { getSupabaseConfig } from '@/src/lib/supabase/config';
import { UUID } from '@/src/lib/golden-rose/contracts';

const desktopOrigins = new Set(['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']);
if (process.env.NODE_ENV !== 'production') {
  desktopOrigins.add('http://127.0.0.1:1420');
  desktopOrigins.add('http://localhost:1420');
}

function reply(request: Request, data: object, status = 200) {
  const origin = request.headers.get('origin');
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store', Vary: 'Origin',
      ...(origin && desktopOrigins.has(origin) ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      } : {}),
    },
  });
}

export function OPTIONS(request: Request) {
  return reply(request, {}, desktopOrigins.has(request.headers.get('origin') ?? '') ? 200 : 403);
}

export async function POST(request: Request) {
  const fail = (error: string, status = 400) => reply(request, { error }, status);
  const origin = request.headers.get('origin');
  if (origin && !desktopOrigins.has(origin)) return fail('This application origin is not permitted.', 403);
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ') || authorization.length > 8192) return fail('Sign in again.', 401);
  if (Number(request.headers.get('content-length') ?? '0') > 4096) return fail('Invalid password request.', 413);
  let fresh: ReturnType<typeof employeePublicAuthClient> | null = null;
  try {
    const body = await request.text();
    if (body.length > 4096) return fail('Invalid password request.', 413);
    let values: { currentPassword?: unknown; password?: unknown; confirmation?: unknown };
    try { values = JSON.parse(body); } catch { return fail('Invalid password request.'); }
    if (!values || typeof values.currentPassword !== 'string' || !values.currentPassword || values.currentPassword.length > 256 ||
      typeof values.password !== 'string' || typeof values.confirmation !== 'string') return fail('Complete the password fields.');
    const invalid = newPasswordError(values.password, values.confirmation);
    if (invalid) return fail(invalid);
    if (values.password === values.currentPassword) return fail('Choose a different password.');
    const { url, publishableKey } = getSupabaseConfig();
    const client = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { authorization } },
    });
    const { data: { user }, error } = await client.auth.getUser(authorization.slice(7));
    if (error || !user?.email || !user.email_confirmed_at || user.is_anonymous) return fail('Sign in with your verified work email.', 401);
    const state = await client.rpc('gr_employee_password_state');
    if (state.error || state.data !== 'change_required') return fail('Password enrollment is unavailable or expired. Ask the owner for a replacement.', 403);
    const admin = employeeAdminClient();
    if (!admin || await employeeEmailConfirmation() !== 'required') return fail('The web server staff administration or email confirmation settings require configuration.', 503);
    fresh = employeePublicAuthClient();
    const reauth = await fresh.auth.signInWithPassword({ email: user.email, password: values.currentPassword });
    if (reauth.error || !reauth.data.session || reauth.data.user?.id !== user.id) return fail('The current password was not accepted.', reauth.error?.status === 429 ? 429 : 401);
    const claims = await fresh.auth.getClaims(reauth.data.session.access_token);
    const sessionId = claims.data?.claims.session_id;
    if (claims.data?.claims.sub !== user.id || typeof sessionId !== 'string' || !UUID.test(sessionId) ||
      (await fresh.rpc('gr_employee_password_state')).data !== 'change_required') return fail('Password enrollment is no longer available.', 403);
    const updated = await fresh.auth.updateUser({ password: values.password, current_password: values.currentPassword });
    if (updated.error) return fail('The password could not be changed. Check the current password and the hosted password policy.');
    const completed = await admin.rpc('gr_employee_password_complete', { p_actor: user.id, p_session: sessionId });
    if (completed.error || completed.data !== 'complete') return fail('The password changed, but staff access could not be enabled. Sign in with the new password and contact the owner if needed.', 503);
    return reply(request, { ok: true });
  } catch {
    return fail('Password setup could not be confirmed. Verify the account before retrying.', 503);
  } finally {
    await fresh?.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }
}
