import { NextRequest, NextResponse } from 'next/server';
import { tmdbGet, TmdbUpstreamError, posterUrl, toMediaType } from '@/app/api/tmdb/_lib';

type TmdbMultiSearchResult = {
  media_type: string;
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path: string | null;
  overview: string | null;
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

    const results = data.results
      .map((r) => {
        const mediaType = toMediaType(r.media_type);
        if (!mediaType) return null; // drops 'person' results
        const dateStr = mediaType === 'movie' ? r.release_date : r.first_air_date;
        return {
          tmdbId: r.id,
          mediaType,
          title: (mediaType === 'movie' ? r.title : r.name) ?? 'Untitled',
          year: dateStr ? dateStr.slice(0, 4) : null,
          posterUrl: posterUrl(r.poster_path),
          overview: r.overview ?? null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    return NextResponse.json({ results });
  } catch (e) {
    if (e instanceof TmdbUpstreamError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Unexpected error contacting TMDB' }, { status: 500 });
  }
}
