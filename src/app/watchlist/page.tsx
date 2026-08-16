'use client';

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilm, faStar, faTrash, faTv } from '@fortawesome/free-solid-svg-icons';
import { useWatch } from '@/lib/watch-context';
import { searchTmdb, type TmdbSearchResult } from '@/lib/tmdb';
import { statusesFor, type MediaType, type WatchItem, type WatchStatus } from '@/lib/types';
import { fromDateInput } from '@/lib/date';
import Skeleton, { SkeletonBlock } from '../components/Skeleton';
import EpisodesModal from './EpisodesModal';
import styles from './watchlist.module.css';

const SEARCH_DEBOUNCE_MS = 350;
const SEARCH_MIN_CHARS = 3;
// Enough to fill the fold at the widest layout without inventing a full shelf.
const SKELETON_CARDS = 6;

const STATUS_LABELS: Record<WatchStatus, string> = {
  watchlist: 'Watchlist',
  watching: 'Watching',
  watched: 'Watched',
};

const FILTERS: { key: 'all' | WatchStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'watchlist', label: 'Watchlist' },
  { key: 'watching', label: 'Watching' },
  { key: 'watched', label: 'Watched' },
];

// '2026-08-15' -> '15 Aug 2026'. Local to this page — the shelf card is the
// only place a watch date is rendered.
function formatWatchDate(day: string): string {
  return fromDateInput(day).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function WatchlistPage() {
  const { items, episodeWatches, loading, error, addItem, updateItem, deleteItem } = useWatch();

  // ── Search / add ──
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TmdbSearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < SEARCH_MIN_CHARS) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults(null);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    const timer = setTimeout(() => {
      searchTmdb(q)
        .then((found) => {
          if (cancelled) return;
          setResults(found);
          setSearchError(null);
        })
        .catch(() => {
          if (cancelled) return;
          setResults([]);
          setSearchError('Search is unavailable right now.');
        })
        .finally(() => {
          if (!cancelled) setSearchLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function resetSearch() {
    setQuery('');
    setResults(null);
  }

  function handleAdd(result: TmdbSearchResult, status: WatchStatus) {
    void addItem({
      tmdbId: result.tmdbId,
      mediaType: result.mediaType,
      title: result.title,
      year: result.year,
      posterUrl: result.posterUrl,
      genres: result.genres,
      status,
    });
    resetSearch();
  }

  const showResults = query.trim().length >= SEARCH_MIN_CHARS;

  // ── Shelf ──
  const [filter, setFilter] = useState<'all' | WatchStatus>('all');
  const shelf = filter === 'all' ? items : items.filter((i) => i.status === filter);

  const watchingCount = items.filter((i) => i.status === 'watching').length;
  const watchlistCount = items.filter((i) => i.status === 'watchlist').length;
  const watchedCount = items.filter((i) => i.status === 'watched').length;

  // ── Episodes modal (one item at a time) ──
  const [episodesItem, setEpisodesItem] = useState<WatchItem | null>(null);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>Watchlist</div>
        <h1 className={styles.title}>Movies & series</h1>
        <div className={styles.meta}>
          {watchingCount} watching · {watchlistCount} on the list · {watchedCount} watched
        </div>
      </header>

      <div className={styles.searchBlock}>
        <input
          className={styles.searchInput}
          placeholder="Search movies and series"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {showResults && (
          <div className={styles.resultsCard}>
            {searchLoading && <div className={styles.resultsMessage}>Searching…</div>}
            {!searchLoading && searchError && (
              <div className={styles.resultsMessage}>{searchError}</div>
            )}
            {!searchLoading && !searchError && results && results.length === 0 && (
              <div className={styles.resultsMessage}>No matches.</div>
            )}
            {!searchLoading &&
              !searchError &&
              results?.map((result) => (
                <div key={`${result.mediaType}-${result.tmdbId}`} className={styles.resultRow}>
                  <PosterThumb
                    src={result.posterUrl}
                    alt=""
                    mediaType={result.mediaType}
                    className={styles.resultCover}
                    iconClassName={styles.resultCoverIcon}
                  />
                  <div className={styles.resultInfo}>
                    <div className={styles.resultTitle}>{result.title}</div>
                    <div className={styles.resultSub}>
                      {result.year ?? 'Unknown year'} · {result.mediaType === 'movie' ? 'Movie' : 'Series'}
                      {result.genres && ` · ${result.genres}`}
                    </div>
                  </div>
                  <div className={styles.resultActions}>
                    <button
                      type="button"
                      className={styles.watchlistBtn}
                      onClick={() => handleAdd(result, 'watchlist')}
                    >
                      Watchlist
                    </button>
                    {/* A movie has no part-way state, so it goes straight on the list. */}
                    {result.mediaType === 'series' ? (
                      <button
                        type="button"
                        className={styles.watchingBtn}
                        onClick={() => handleAdd(result, 'watching')}
                      >
                        Watching
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.watchingBtn}
                        onClick={() => handleAdd(result, 'watched')}
                      >
                        Watched
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {error && <div className={styles.message}>{error}</div>}

      <div className={styles.filterPills}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={[styles.filterPill, filter === f.key ? styles.filterPillActive : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && items.length === 0 && !error ? (
        <ShelfSkeleton />
      ) : !loading && !error && shelf.length === 0 ? (
        <div className={styles.empty}>
          <FontAwesomeIcon icon={faFilm} className={styles.emptyIcon} />
          <p>Nothing tracked yet. Search above to start your list.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {shelf.map((item) => {
            const watchedEpisodeCount = episodeWatches.filter((w) => w.watchItemId === item.id).length;
            return (
              <WatchCard
                key={item.id}
                item={item}
                watchedEpisodeCount={watchedEpisodeCount}
                onStatusChange={(status) => void updateItem(item.id, { status })}
                onRate={(rating) => void updateItem(item.id, { rating })}
                onDelete={() => void deleteItem(item.id)}
                onOpenEpisodes={() => setEpisodesItem(item)}
              />
            );
          })}
        </div>
      )}

      <EpisodesModal item={episodesItem} onClose={() => setEpisodesItem(null)} />
    </div>
  );
}

// ── Loading skeleton ──

// Reuses .grid and .card so the placeholders occupy exactly the geometry the
// real cards will: same track sizing, same padding, same 8px internal gap.
function ShelfSkeleton() {
  return (
    <SkeletonBlock className={styles.grid} label="Loading watchlist">
      {Array.from({ length: SKELETON_CARDS }, (_, i) => (
        <div key={i} className={styles.card}>
          <Skeleton width="100%" style={{ aspectRatio: '2 / 3' }} />
          <Skeleton height={18} width="75%" radius={4} />
          <Skeleton height={12} width="45%" radius={4} />
          <Skeleton height={29} />
        </div>
      ))}
    </SkeletonBlock>
  );
}

// ── Poster with fallback ──

function PosterThumb({
  src,
  alt,
  mediaType,
  className,
  iconClassName,
}: {
  src: string | null;
  alt: string;
  mediaType: MediaType;
  className: string;
  iconClassName: string;
}) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return (
      <div className={className} aria-hidden="true">
        <FontAwesomeIcon icon={mediaType === 'movie' ? faFilm : faTv} className={iconClassName} />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable domain; no local optimization needed for a small thumbnail
  return <img src={src} alt={alt} className={className} onError={() => setErrored(true)} />;
}

// ── Watch card ──

type WatchCardProps = {
  item: WatchItem;
  watchedEpisodeCount: number;
  onStatusChange: (status: WatchStatus) => void;
  onRate: (rating: number) => void;
  onDelete: () => void;
  onOpenEpisodes: () => void;
};

function WatchCard({
  item,
  watchedEpisodeCount,
  onStatusChange,
  onRate,
  onDelete,
  onOpenEpisodes,
}: WatchCardProps) {
  const isSeries = item.mediaType === 'series';
  const watchedOn = item.status === 'watched' ? item.finishedOn : null;

  return (
    <div className={styles.card}>
      <button type="button" className={styles.deleteBtn} onClick={onDelete} aria-label="Delete from watchlist">
        <FontAwesomeIcon icon={faTrash} />
      </button>

      <PosterThumb
        src={item.posterUrl}
        alt={item.title}
        mediaType={item.mediaType}
        className={styles.cover}
        iconClassName={styles.coverIcon}
      />

      <div className={styles.cardHead}>
        <div className={styles.cardTitle}>{item.title}</div>
        <div className={styles.cardMeta}>
          {item.year && (
            <>
              <span>{item.year}</span>
              <span className={styles.metaDot}>·</span>
            </>
          )}
          <span className={styles.mediaBadge}>{isSeries ? 'Series' : 'Movie'}</span>
        </div>
      </div>
      {item.genres && <div className={styles.cardGenres}>{item.genres}</div>}

      {/* Segmented control rather than pills: two statuses for a movie and
          three for a series both fit one row, so cards stay aligned. */}
      <div className={styles.statusBar}>
        {statusesFor(item.mediaType).map((status) => (
          <button
            key={status}
            type="button"
            className={[styles.statusSeg, item.status === status ? styles.statusSegActive : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => onStatusChange(status)}
          >
            {STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      {/* Stars and the watched date both appear only on 'watched', so they sit
          together here — keeping them out of the footer means the episodes
          button stays aligned across every card in a row. */}
      {item.status === 'watched' && (
        <div className={styles.stars}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={styles.starBtn}
              onClick={() => onRate(n)}
              aria-label={`Rate ${n} star${n === 1 ? '' : 's'}`}
            >
              <FontAwesomeIcon
                icon={faStar}
                className={item.rating && n <= item.rating ? styles.starFilled : styles.starEmpty}
              />
            </button>
          ))}
        </div>
      )}

      {watchedOn && <div className={styles.watchedOn}>Watched {formatWatchDate(watchedOn)}</div>}

      {/* Pinned to the bottom (margin-top:auto) so the episodes button lands in
          the same place on every card in a row. */}
      {isSeries && (
        <div className={styles.cardFooter}>
          <button type="button" className={styles.episodesBtn} onClick={onOpenEpisodes}>
            {item.totalEpisodes != null ? `${watchedEpisodeCount} / ${item.totalEpisodes} episodes` : 'Episodes'}
          </button>
        </div>
      )}
    </div>
  );
}
