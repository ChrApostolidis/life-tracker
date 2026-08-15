import { NextRequest, NextResponse } from 'next/server';
import { tmdbGet, TmdbUpstreamError, posterUrl, resolveGenres, toMediaType } from '@/app/api/tmdb/_lib';

type TmdbMultiSearchResult = {
  media_type: string;
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path: string | null;
  overview: string | null;
  genre_ids?: number[];
};

type TmdbMultiSearchResponse = { results: TmdbMultiSearchResult[] };

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim();
  if (!query) return NextResponse.json({ results: [] });

  try {
    const data = await tmdbGet<TmdbMultiSearchResponse>('/search/multi', {
      query,
      include_adult: 'false',
    });

    const watchable = data.results
      .map((r) => ({ raw: r, mediaType: toMediaType(r.media_type) }))
      .filter((r): r is { raw: TmdbMultiSearchResult; mediaType: 'movie' | 'series' } => r.mediaType !== null);

    // resolveGenres is async but memoized after the first call, so this costs
    // at most two extra upstream requests for the whole server process.
    const results = await Promise.all(
      watchable.map(async ({ raw, mediaType }) => {
        const dateStr = mediaType === 'movie' ? raw.release_date : raw.first_air_date;
        return {
          tmdbId: raw.id,
          mediaType,
          title: (mediaType === 'movie' ? raw.title : raw.name) ?? 'Untitled',
          year: dateStr ? dateStr.slice(0, 4) : null,
          posterUrl: posterUrl(raw.poster_path),
          genres: await resolveGenres(mediaType, raw.genre_ids),
          overview: raw.overview ?? null,
        };
      }),
    );

    return NextResponse.json({ results });
  } catch (e) {
    if (e instanceof TmdbUpstreamError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Unexpected error contacting TMDB' }, { status: 500 });
  }
}
