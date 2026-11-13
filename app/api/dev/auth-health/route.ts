import { getSupabaseConfig } from '@/src/lib/supabase/config';

/** Diagnostic reports no secrets or user information; disabled in production. */
export async function GET() {
  if (process.env.NODE_ENV !== 'development') return new Response(null, { status: 404 });

  try {
    const { url, publishableKey } = getSupabaseConfig();
    const correctProject = new URL(url).hostname === 'eixbmsethgrtezhdmgsh.supabase.co';
    if (!correctProject) {
      return Response.json({
        configured: true, correctProject: false, authReachable: false,
        guidance: 'NEXT_PUBLIC_SUPABASE_URL is not pointing to the Golden Rose project.',
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const response = await fetch(new URL('/auth/v1/health', url), {
      headers: { apikey: publishableKey },
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(7000),
    });

    return Response.json({
      configured: true, correctProject: true,
      authReachable: response.ok, authHttpStatus: response.status,
      guidance: response.ok
        ? 'The local server can reach Golden Rose Auth. If sign-in fails, inspect the server-side sign-in error code.'
        : 'Golden Rose Auth responded with an error. Check the local publishable key and Supabase service status.',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const configError = error instanceof Error && /Supabase is not configured|NEXT_PUBLIC_SUPABASE/i.test(error.message);
    return Response.json({
      configured: !configError,
      correctProject: configError ? null : true,
      authReachable: false,
      guidance: configError
        ? 'Set the Golden Rose NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local, then restart Next.js.'
        : 'The local Next.js server could not reach Golden Rose Auth. Check DNS, internet, firewall or proxy settings.',
    }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
