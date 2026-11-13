import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseConfig } from '@/src/lib/supabase/config';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const responseHeaders = new Headers({ 'Cache-Control': 'private, no-store' });

  try {
    const { url, publishableKey } = getSupabaseConfig();
    const supabase = createServerClient(url, publishableKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookies, headers) {
          for (const { name, value } of cookies) request.cookies.set(name, value);
          const previousCookies = response.cookies.getAll();
          response = NextResponse.next({ request });
          for (const cookie of previousCookies) response.cookies.set(cookie);
          for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
          for (const [name, value] of Object.entries(headers)) responseHeaders.set(name, value);
        },
      },
    });
    await supabase.auth.getClaims();
  } catch {
    // Workspace pages and actions perform the authoritative staff check.
  }

  for (const [name, value] of responseHeaders) response.headers.set(name, value);
  return response;
}

export const config = { matcher: ['/workspace/:path*', '/staff/login', '/account/:path*', '/shop/:slug', '/cart', '/checkout'] };
