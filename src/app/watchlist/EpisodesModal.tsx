'use client';

import { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck } from '@fortawesome/free-solid-svg-icons';
import Modal from '../components/Modal';
import { useWatch } from '@/lib/watch-context';
import { fetchSeason, fetchSeries, type TmdbEpisode, type TmdbSeasonSummary } from '@/lib/tmdb';
import type { WatchItem } from '@/lib/types';
import styles from './episodesModal.module.css';

export default function EpisodesModal({ item, onClose }: { item: WatchItem | null; onClose: () => void }) {
  const { episodeWatches, toggleEpisode } = useWatch();

  const [seasons, setSeasons] = useState<TmdbSeasonSummary[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [episodesBySeason, setEpisodesBySeason] = useState<Record<number, TmdbEpisode[]>>({});
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<'watch' | 'unwatch' | null>(null);

  const watchedKeys = useMemo(
    () =>
      new Set(
        episodeWatches
          .filter((w) => w.watchItemId === item?.id)
          .map((w) => `${w.seasonNumber}-${w.episodeNumber}`),
      ),
    [episodeWatches, item],
  );

  function seasonWatchedCount(seasonNumber: number): number {
    return episodeWatches.filter((w) => w.watchItemId === item?.id && w.seasonNumber === seasonNumber).length;
  }

  // Load the season list for this series whenever the modal opens for a
  // (possibly different) item. TMDB uses season 0 for specials — skip it
  // unless it's the only season the series has.
  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    // Load-on-open; this effect owns its own loading/error state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingSeries(true);
    setError(null);
    setEpisodesBySeason({});
    fetchSeries(item.tmdbId)
      .then((detail) => {
        if (cancelled) return;
        const realSeasons = detail.seasons.filter((s) => s.seasonNumber > 0);
        const list = realSeasons.length > 0 ? realSeasons : detail.seasons;
        setSeasons(list);
        const defaultSeason =
          list.find((s) => seasonWatchedCount(s.seasonNumber) < s.episodeCount)?.seasonNumber ??
          list[0]?.seasonNumber ??
          null;
        setSelectedSeason(defaultSeason);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load seasons.');
      })
      .finally(() => {
        if (!cancelled) setLoadingSeries(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  // Load (and cache) the episode list for whichever season is selected.
  useEffect(() => {
    if (!item || selectedSeason == null || episodesBySeason[selectedSeason]) return;
    let cancelled = false;
    // Load-on-season-change; this effect owns its own loading state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingEpisodes(true);
    fetchSeason(item.tmdbId, selectedSeason)
      .then((episodes) => {
        if (cancelled) return;
        setEpisodesBySeason((prev) => ({ ...prev, [selectedSeason]: episodes }));
      })
      .catch(() => {
        if (!cancelled) setError('Could not load episodes.');
      })
      .finally(() => {
        if (!cancelled) setLoadingEpisodes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item, selectedSeason, episodesBySeason]);

  // Sequential, not Promise.all — ticking 24 episodes at once shouldn't fire
  // 24 simultaneous requests. `watched` picks the direction: only episodes
  // already in the wrong state get toggled, so this is safe to re-run.
  async function applyToSeason(watched: boolean) {
    if (!item || selectedSeason == null) return;
    setBulkBusy(watched ? 'watch' : 'unwatch');
    for (const ep of episodesBySeason[selectedSeason] ?? []) {
      if (watchedKeys.has(`${selectedSeason}-${ep.episodeNumber}`) !== watched) {
        await toggleEpisode(item.id, selectedSeason, ep.episodeNumber);
      }
    }
    setBulkBusy(null);
  }

  const currentEpisodes = selectedSeason != null ? (episodesBySeason[selectedSeason] ?? []) : [];
  const watchedInSeason = currentEpisodes.filter((ep) =>
    watchedKeys.has(`${selectedSeason}-${ep.episodeNumber}`),
  ).length;

  return (
    <Modal open={item !== null} eyebrow="Episodes" onClose={onClose} width={520} height={620}>
      {item && (
        <div className={styles.body}>
          <div className={styles.itemTitle}>{item.title}</div>

          {error && <div className={styles.message}>{error}</div>}
          {!error && loadingSeries && <div className={styles.message}>Loading seasons…</div>}

          {!loadingSeries && seasons.length > 0 && (
            <>
              <div className={styles.seasonPills}>
                {seasons.map((s) => (
                  <button
                    key={s.seasonNumber}
                    type="button"
                    className={[
                      styles.seasonPill,
                      selectedSeason === s.seasonNumber ? styles.seasonPillActive : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setSelectedSeason(s.seasonNumber)}
                  >
                    {s.seasonNumber === 0 ? 'Specials' : `S${s.seasonNumber}`}
                  </button>
                ))}
              </div>

              <div className={styles.episodeList}>
                {loadingEpisodes && <div className={styles.message}>Loading episodes…</div>}
                {!loadingEpisodes &&
                  currentEpisodes.map((ep) => {
                    const watched = selectedSeason != null && watchedKeys.has(`${selectedSeason}-${ep.episodeNumber}`);
                    return (
                      <button
                        key={ep.episodeNumber}
                        type="button"
                        className={styles.episodeRow}
                        onClick={() =>
                          selectedSeason != null && void toggleEpisode(item.id, selectedSeason, ep.episodeNumber)
                        }
                        role="checkbox"
                        aria-checked={watched}
                        aria-label={
                          watched ? `Mark S${selectedSeason}E${ep.episodeNumber} not watched` : `Mark S${selectedSeason}E${ep.episodeNumber} watched`
                        }
                      >
                        <span
                          className={[styles.checkbox, watched ? styles.checkboxChecked : '']
                            .filter(Boolean)
                            .join(' ')}
                        >
                          {watched && (
                            <span className={styles.checkIcon}>
                              <FontAwesomeIcon icon={faCheck} />
                            </span>
                          )}
                        </span>
                        <span className={styles.episodeCode}>
                          S{selectedSeason}E{ep.episodeNumber}
                        </span>
                        <span className={styles.episodeName}>{ep.name}</span>
                        {ep.airDate && <span className={styles.episodeDate}>{ep.airDate}</span>}
                      </button>
                    );
                  })}
              </div>

              {/* Outside .episodeList, which owns the scroll — so these stay
                  put no matter how long the season is. */}
              <div className={styles.bulkActions}>
                <button
                  type="button"
                  className={styles.bulkBtn}
                  onClick={() => void applyToSeason(true)}
                  disabled={bulkBusy !== null || currentEpisodes.length === 0 || watchedInSeason === currentEpisodes.length}
                >
                  {bulkBusy === 'watch' ? 'Marking…' : 'Mark season watched'}
                </button>
                <button
                  type="button"
                  className={styles.bulkBtnGhost}
                  onClick={() => void applyToSeason(false)}
                  disabled={bulkBusy !== null || watchedInSeason === 0}
                >
                  {bulkBusy === 'unwatch' ? 'Clearing…' : 'Unwatch season'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
