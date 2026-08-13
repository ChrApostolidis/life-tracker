'use client';

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilm, faStar, faTrash, faTv } from '@fortawesome/free-solid-svg-icons';
import { useWatch } from '@/lib/watch-context';
import { searchTmdb, type TmdbSearchResult } from '@/lib/tmdb';
import type { MediaType, WatchItem, WatchStatus } from '@/lib/types';
import EpisodesModal from './EpisodesModal';
import styles from './watchlist.module.css';

const SEARCH_DEBOUNCE_MS = 350;
const SEARCH_MIN_CHARS = 3;

const FILTERS: { key: 'all' | WatchStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'watchlist', label: 'Watchlist' },
  { key: 'watching', label: 'Watching' },
  { key: 'watched', label: 'Watched' },
  { key: 'dropped', label: 'Dropped' },
];

const STATUS_PILLS: { key: WatchStatus; label: string }[] = [
  { key: 'watchlist', label: 'Watchlist' },
  { key: 'watching', label: 'Watching' },
  { key: 'watched', label: 'Watched' },
  { key: 'dropped', label: 'Dropped' },
];

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
                    <button
                      type="button"
                      className={styles.watchingBtn}
                      onClick={() => handleAdd(result, 'watching')}
                    >
                      Watching
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {error && <div className={styles.message}>{error}</div>}
      {!error && loading && items.length === 0 && <div className={styles.message}>Loading…</div>}

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

      {!loading && !error && shelf.length === 0 ? (
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

      <div className={styles.cardTitle}>{item.title}</div>
      <div className={styles.cardMeta}>
        {item.year && <span>{item.year}</span>}
        <span className={styles.mediaBadge}>{isSeries ? 'Series' : 'Movie'}</span>
      </div>

      <div className={styles.statusPills}>
        {STATUS_PILLS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={[styles.statusPill, item.status === s.key ? styles.statusPillActive : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => onStatusChange(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

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

      {isSeries && (
        <button type="button" className={styles.episodesBtn} onClick={onOpenEpisodes}>
          {item.totalEpisodes != null ? `${watchedEpisodeCount} / ${item.totalEpisodes} episodes` : 'Episodes'}
        </button>
      )}

      {(item.startedOn || item.finishedOn) && (
        <div className={styles.dates}>
          {item.startedOn ?? '—'} → {item.finishedOn ?? '—'}
        </div>
      )}
    </div>
  );
}
