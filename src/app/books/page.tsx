'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBook, faPen, faStar, faTrash } from '@fortawesome/free-solid-svg-icons';
import { useBooks } from '@/lib/books-context';
import { searchBooks, type BookSearchResult } from '@/lib/open-library';
import type { Book, BookStatus } from '@/lib/types';
import ThoughtsModal from './ThoughtsModal';
import styles from './books.module.css';

const SEARCH_DEBOUNCE_MS = 350;
const SEARCH_MIN_CHARS = 3;

const FILTERS: { key: 'all' | BookStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'reading', label: 'Reading' },
  { key: 'owned', label: 'Owned' },
  { key: 'wishlist', label: 'Wishlist' },
  { key: 'finished', label: 'Finished' },
];

const STATUS_PILLS: { key: BookStatus; label: string }[] = [
  { key: 'wishlist', label: 'Wishlist' },
  { key: 'owned', label: 'Owned' },
  { key: 'reading', label: 'Reading' },
  { key: 'finished', label: 'Finished' },
];

export default function BooksPage() {
  const { books, loading, error, addBook, updateBook, deleteBook } = useBooks();

  // ── Search / add ──
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BookSearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualAuthor, setManualAuthor] = useState('');

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
      searchBooks(q)
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
    setManualMode(false);
    setManualTitle('');
    setManualAuthor('');
  }

  function handleAddFromResult(result: BookSearchResult, status: BookStatus) {
    void addBook({ title: result.title, author: result.author, status, coverUrl: result.coverUrl });
    resetSearch();
  }

  function handleAddManual(status: BookStatus) {
    const title = manualTitle.trim();
    if (!title) return;
    void addBook({ title, author: manualAuthor.trim() || null, status });
    resetSearch();
  }

  function handleManualKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') setManualMode(false);
  }

  const showResults = query.trim().length >= SEARCH_MIN_CHARS && !manualMode;

  // ── Shelf ──
  const [filter, setFilter] = useState<'all' | BookStatus>('all');
  const shelf = filter === 'all' ? books : books.filter((b) => b.status === filter);

  const ownedCount = books.filter((b) => b.status === 'owned').length;
  const readingCount = books.filter((b) => b.status === 'reading').length;
  const wishlistCount = books.filter((b) => b.status === 'wishlist').length;

  // ── Thoughts modal (one book at a time) ──
  const [thoughtsBook, setThoughtsBook] = useState<Book | null>(null);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>Books</div>
        <h1 className={styles.title}>Library</h1>
        <div className={styles.meta}>
          {ownedCount} owned · {readingCount} reading · {wishlistCount} on the wishlist
        </div>
      </header>

      <div className={styles.searchBlock}>
        <input
          className={styles.searchInput}
          placeholder="Search by title or author"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setManualMode(false);
          }}
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
                <div key={result.key} className={styles.resultRow}>
                  <BookCover src={result.coverUrl} alt="" className={styles.resultCover} iconClassName={styles.resultCoverIcon} />
                  <div className={styles.resultInfo}>
                    <div className={styles.resultTitle}>{result.title}</div>
                    <div className={styles.resultSub}>
                      {result.author ?? 'Unknown author'}
                      {result.year ? ` · ${result.year}` : ''}
                    </div>
                  </div>
                  <div className={styles.resultActions}>
                    <button
                      type="button"
                      className={styles.ownBtn}
                      onClick={() => handleAddFromResult(result, 'owned')}
                    >
                      Own it
                    </button>
                    <button
                      type="button"
                      className={styles.wantBtn}
                      onClick={() => handleAddFromResult(result, 'wishlist')}
                    >
                      Want it
                    </button>
                  </div>
                </div>
              ))}

            {!manualMode && (
              <button type="button" className={styles.manualToggle} onClick={() => setManualMode(true)}>
                Not found — add manually
              </button>
            )}

            {manualMode && (
              <div className={styles.manualForm} onKeyDown={handleManualKeyDown}>
                <input
                  className={styles.manualInput}
                  placeholder="Title"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  autoFocus
                />
                <input
                  className={styles.manualInput}
                  placeholder="Author (optional)"
                  value={manualAuthor}
                  onChange={(e) => setManualAuthor(e.target.value)}
                />
                <div className={styles.resultActions}>
                  <button type="button" className={styles.ownBtn} onClick={() => handleAddManual('owned')}>
                    Own it
                  </button>
                  <button type="button" className={styles.wantBtn} onClick={() => handleAddManual('wishlist')}>
                    Want it
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {error && <div className={styles.message}>{error}</div>}
      {!error && loading && books.length === 0 && <div className={styles.message}>Loading…</div>}

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
          <FontAwesomeIcon icon={faBook} className={styles.emptyIcon} />
          <p>No books yet. Search above to start your library.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {shelf.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              onOpenThoughts={() => setThoughtsBook(book)}
              onStatusChange={(status) => void updateBook(book.id, { status })}
              onRate={(rating) => void updateBook(book.id, { rating })}
              onDelete={() => void deleteBook(book.id)}
            />
          ))}
        </div>
      )}

      <ThoughtsModal book={thoughtsBook} onClose={() => setThoughtsBook(null)} />
    </div>
  );
}

// ── Book cover with fallback ──

function BookCover({
  src,
  alt,
  className,
  iconClassName,
}: {
  src: string | null;
  alt: string;
  className: string;
  iconClassName: string;
}) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return (
      <div className={className} aria-hidden="true">
        <FontAwesomeIcon icon={faBook} className={iconClassName} />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable domain; no local optimization needed for a small thumbnail
  return <img src={src} alt={alt} className={className} onError={() => setErrored(true)} />;
}

// ── Book card ──

type BookCardProps = {
  book: Book;
  onOpenThoughts: () => void;
  onStatusChange: (status: BookStatus) => void;
  onRate: (rating: number) => void;
  onDelete: () => void;
};

function BookCard({
  book,
  onOpenThoughts,
  onStatusChange,
  onRate,
  onDelete,
}: BookCardProps) {
  return (
    <div className={styles.card}>
      <button type="button" className={styles.deleteBtn} onClick={onDelete} aria-label="Delete book">
        <FontAwesomeIcon icon={faTrash} />
      </button>

      <BookCover src={book.coverUrl} alt={book.title} className={styles.cover} iconClassName={styles.coverIcon} />

      <div className={styles.cardTitle}>{book.title}</div>
      {book.author && <div className={styles.cardAuthor}>{book.author}</div>}

      <div className={styles.statusPills}>
        {STATUS_PILLS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={[styles.statusPill, book.status === s.key ? styles.statusPillActive : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => onStatusChange(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {book.status === 'finished' && (
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
                className={book.rating && n <= book.rating ? styles.starFilled : styles.starEmpty}
              />
            </button>
          ))}
        </div>
      )}

      {(book.startedOn || book.finishedOn) && (
        <div className={styles.dates}>
          {book.startedOn ?? '—'} → {book.finishedOn ?? '—'}
        </div>
      )}

      <button type="button" className={styles.notesToggle} onClick={onOpenThoughts}>
        <FontAwesomeIcon icon={faPen} className={styles.notesToggleIcon} />
        Thoughts
      </button>
    </div>
  );
}
