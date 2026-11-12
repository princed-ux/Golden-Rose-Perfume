import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseConfig } from '@/src/lib/supabase/config';
import { RECOVERY_COOKIE, resolveAuthOrigin } from '@/src/lib/customer/auth-policy';

export async function GET(request: NextRequest) {
  const origin = resolveAuthOrigin(process.env.NEXT_PUBLIC_SITE_URL, request.headers.get('host'));
  if (!origin) {
    return new NextResponse('Account redirects are unavailable on this website address.', {
      status: 503, headers: { 'Cache-Control': 'private, no-store' },
    });
  }

  const params = request.nextUrl.searchParams;
  const recovery = params.get('mode') === 'recovery' || params.get('type') === 'recovery';
  const errorPath = recovery ? '/account/forgot-password?notice=expired' : '/account/login?notice=callback';
  const response = NextResponse.redirect(new URL(errorPath, origin), 303);
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');

  try {
    const code = params.get('code');
    const tokenHash = params.get('token_hash');
    const type = params.get('type');
    if ((!code && !tokenHash) || (code && tokenHash) || params.has('error') || params.has('error_code')) return response;

    const { url, publishableKey } = getSupabaseConfig();
    const supabase = createServerClient(url, publishableKey, {
      cookieOptions: { secure: origin.startsWith('https:') },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(items, headers) {
          for (const { name, value, options } of items) {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          }
          for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
        },
      },
    });

    let isRecovery: boolean;
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error || !data.session) return response;
      isRecovery = 'redirectType' in data && data.redirectType === 'recovery';
    } else {
      if (!tokenHash || (type !== 'email' && type !== 'signup' && type !== 'recovery')) return response;
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (error || !data.session) return response;
      isRecovery = type === 'recovery';
    }

    if (isRecovery) {
      const { data, error } = await supabase.auth.getClaims();
      const sessionId = data?.claims.session_id;
      if (error || !sessionId) return response;
      response.cookies.set(RECOVERY_COOKIE, sessionId, {
        httpOnly: true, secure: origin.startsWith('https:'), sameSite: 'lax', path: '/', maxAge: 900,
      });
      response.headers.set('Location', new URL('/account/reset-password', origin).toString());
    } else {
      response.cookies.delete(RECOVERY_COOKIE);
      response.headers.set('Location', new URL('/account/dashboard', origin).toString());
    }
    return response;
  } catch {
    return response;
  }
}
