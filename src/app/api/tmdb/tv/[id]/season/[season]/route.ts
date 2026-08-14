import { NextResponse } from 'next/server';
import { tmdbGet, TmdbUpstreamError } from '@/app/api/tmdb/_lib';

type TmdbEpisode = {
  episode_number: number;
  name: string;
  air_date: string | null;
  runtime: number | null;
};

type TmdbSeasonDetails = { episodes: TmdbEpisode[] };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; season: string }> },
) {
  const { id, season } = await params;

  try {
    const data = await tmdbGet<TmdbSeasonDetails>(`/tv/${id}/season/${season}`);
    return NextResponse.json({
      episodes: data.episodes.map((e) => ({
        episodeNumber: e.episode_number,
        name: e.name,
        airDate: e.air_date,
        runtime: e.runtime,
      })),
    });
  } catch (e) {
    if (e instanceof TmdbUpstreamError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Unexpected error contacting TMDB' }, { status: 500 });
  }
}
