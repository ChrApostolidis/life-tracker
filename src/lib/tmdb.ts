// Client for our own Next.js Route Handlers under /api/tmdb — never calls
// api.themoviedb.org directly. MOVIES_API_KEY is only read server-side inside
// those route handlers, so this file must never import anything that reads
// process.env.MOVIES_API_KEY.
import type { MediaType } from './types';

export type TmdbSearchResult = {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year: string | null;
  posterUrl: string | null;
  overview: string | null;
};

export type TmdbSeasonSummary = {
  seasonNumber: number;
  episodeCount: number;
  name: string;
};

export type TmdbSeriesDetail = {
  numberOfSeasons: number;
  numberOfEpisodes: number;
  seasons: TmdbSeasonSummary[];
};

export type TmdbEpisode = {
  episodeNumber: number;
  name: string;
  airDate: string | null;
  runtime: number | null;
};

export async function searchTmdb(query: string): Promise<TmdbSearchResult[]> {
  const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`TMDB search failed (HTTP ${res.status})`);
  const data = (await res.json()) as { results: TmdbSearchResult[] };
  return data.results;
}

export async function fetchSeries(tmdbId: number): Promise<TmdbSeriesDetail> {
  const res = await fetch(`/api/tmdb/tv/${tmdbId}`);
  if (!res.ok) throw new Error(`TMDB series lookup failed (HTTP ${res.status})`);
  return (await res.json()) as TmdbSeriesDetail;
}

export async function fetchSeason(tmdbId: number, season: number): Promise<TmdbEpisode[]> {
  const res = await fetch(`/api/tmdb/tv/${tmdbId}/season/${season}`);
  if (!res.ok) throw new Error(`TMDB season lookup failed (HTTP ${res.status})`);
  const data = (await res.json()) as { episodes: TmdbEpisode[] };
  return data.episodes;
}
