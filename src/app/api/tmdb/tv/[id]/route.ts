import { NextResponse } from 'next/server';
import { tmdbGet, TmdbUpstreamError } from '@/app/api/tmdb/_lib';

type TmdbSeasonSummary = { season_number: number; episode_count: number; name: string };

type TmdbTvDetails = {
  number_of_seasons: number;
  number_of_episodes: number;
  seasons: TmdbSeasonSummary[];
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const data = await tmdbGet<TmdbTvDetails>(`/tv/${id}`);
    return NextResponse.json({
      numberOfSeasons: data.number_of_seasons,
      numberOfEpisodes: data.number_of_episodes,
      seasons: data.seasons.map((s) => ({
        seasonNumber: s.season_number,
        episodeCount: s.episode_count,
        name: s.name,
      })),
    });
  } catch (e) {
    if (e instanceof TmdbUpstreamError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Unexpected error contacting TMDB' }, { status: 500 });
  }
}
