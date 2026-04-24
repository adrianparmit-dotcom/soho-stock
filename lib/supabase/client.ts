// @ts-nocheck
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // En build time las env vars no están. Devolvemos un stub que tira en runtime.
    if (typeof window === 'undefined') {
      return {} as any;
    }
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }
  return createBrowserClient(url, key);
}
