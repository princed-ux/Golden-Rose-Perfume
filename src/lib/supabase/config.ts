interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

export function getSupabaseConfig(): SupabaseConfig {
  // Next.js inlines public variables in browser code through direct references.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local.',
    );
  }

  const endpoint = URL.canParse(url) ? new URL(url) : null;
  if (!endpoint || !['https:', 'http:'].includes(endpoint.protocol) ||
      endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL must be a valid Supabase HTTP or HTTPS endpoint.');
  }

  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
    throw new Error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key.');
  }

  return { url, publishableKey };
}
