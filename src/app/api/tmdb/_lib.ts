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

// More than three genres stops being a label and starts being a paragraph.
const MAX_GENRES = 3;

type TmdbGenreList = { genres: { id: number; name: string }[] };

// Multi-search returns genre ids, not names. The two id->name maps are small
// and effectively static, so each is fetched once per server process.
const genreNamesByKind = new Map<string, Map<number, string>>();

async function genreNames(kind: 'movie' | 'tv'): Promise<Map<number, string>> {
  const cached = genreNamesByKind.get(kind);
  if (cached) return cached;
  const data = await tmdbGet<TmdbGenreList>(`/genre/${kind}/list`);
  const names = new Map(data.genres.map((g) => [g.id, g.name]));
  genreNamesByKind.set(kind, names);
  return names;
}

// Returns 'Comedy, Drama' — or null if the lookup fails, since a missing genre
// label is not worth failing an otherwise good search result over.
export async function resolveGenres(
  mediaType: 'movie' | 'series',
  genreIds: number[] | undefined,
): Promise<string | null> {
  if (!genreIds || genreIds.length === 0) return null;
  try {
    const names = await genreNames(mediaType === 'movie' ? 'movie' : 'tv');
    const resolved = genreIds
      .map((id) => names.get(id))
      .filter((name): name is string => Boolean(name))
      .slice(0, MAX_GENRES);
    return resolved.length > 0 ? resolved.join(', ') : null;
  } catch {
    return null;
  }
}
