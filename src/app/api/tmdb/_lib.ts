// Shared helpers for the TMDB route handlers only — deliberately not in
// src/lib, since everything there is fair game to import from a 'use client'
// component. Keeping this inside app/api/tmdb makes it structurally awkward
// to reach from the browser, on top of the fact that MOVIES_API_KEY is only
// ever read here, never exposed via a NEXT_PUBLIC_ variable.

export const TMDB_BASE = 'https://api.themoviedb.org/3';
export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';

export class TmdbUpstreamError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getApiKey(): string {
  const key = process.env.MOVIES_API_KEY;
  if (!key) throw new TmdbUpstreamError(500, 'MOVIES_API_KEY is not configured on the server');
  return key;
}

// Never call this from a 'use client' file — it reads MOVIES_API_KEY, which
// is intentionally not prefixed with NEXT_PUBLIC_ so it stays server-only.
export async function tmdbGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const apiKey = getApiKey();
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('language', 'en-US');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new TmdbUpstreamError(res.status, `TMDB request failed (HTTP ${res.status})`);
  }
  return (await res.json()) as T;
}

export function posterUrl(posterPath: string | null): string | null {
  return posterPath ? `${TMDB_IMAGE_BASE}${posterPath}` : null;
}

// TMDB's 'tv' -> our 'series', normalized here so 'tv' never appears past
// this network boundary.
export function toMediaType(tmdbMediaType: string): 'movie' | 'series' | null {
  if (tmdbMediaType === 'movie') return 'movie';
  if (tmdbMediaType === 'tv') return 'series';
  return null; // 'person' and anything else — filtered out by the caller
}
