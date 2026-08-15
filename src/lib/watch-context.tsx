'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { EpisodeWatch, WatchItem, WatchItemInput, WatchItemPatch } from './types';
import { api, describeError } from './api';

type WatchCtx = {
  items: WatchItem[];
  episodeWatches: EpisodeWatch[];
  loading: boolean;
  error: string | null;
  isEpisodeWatched: (watchItemId: string, season: number, episode: number) => boolean;
  addItem: (input: WatchItemInput) => Promise<void>;
  updateItem: (id: string, patch: WatchItemPatch) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  toggleEpisode: (watchItemId: string, season: number, episode: number) => Promise<void>;
};

const WatchContext = createContext<WatchCtx | null>(null);

// Route-scoped, like Money/Books — not root-mounted like Habits. Only
// /watchlist consumes this in this pass (no Home card yet), so a root
// provider would make every page pay for a fetch it never uses.
export function WatchProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [episodeWatches, setEpisodeWatches] = useState<EpisodeWatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Live snapshots for async handlers that need current state to revert.
  const itemsRef = useRef<WatchItem[]>(items);
  const episodeWatchesRef = useRef<EpisodeWatch[]>(episodeWatches);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    episodeWatchesRef.current = episodeWatches;
  }, [episodeWatches]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemsResult, episodeWatchesResult] = await Promise.all([
        api.listWatchItems(),
        api.listEpisodeWatches(),
      ]);
      setItems(itemsResult);
      setEpisodeWatches(episodeWatchesResult);
    } catch (e) {
      setError(describeError(e, 'Could not load watchlist'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Load once on mount; refresh() owns its own loading/error state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const isEpisodeWatched = useCallback(
    (watchItemId: string, season: number, episode: number) =>
      episodeWatchesRef.current.some(
        (w) => w.watchItemId === watchItemId && w.seasonNumber === season && w.episodeNumber === episode,
      ),
    [],
  );

  const addItem = useCallback(async (input: WatchItemInput) => {
    const tempId = `temp-watch-item-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const optimistic: WatchItem = {
      id: tempId,
      tmdbId: input.tmdbId,
      mediaType: input.mediaType,
      title: input.title,
      year: input.year ?? null,
      posterUrl: input.posterUrl ?? null,
      genres: input.genres ?? null,
      status: input.status,
      rating: null,
      startedOn: null,
      finishedOn: null,
      totalSeasons: input.totalSeasons ?? null,
      totalEpisodes: input.totalEpisodes ?? null,
      notes: null,
      deletedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    // Newest first, matching the backend's ordering.
    setItems((prev) => [optimistic, ...prev]);
    try {
      const created = await api.createWatchItem(input);
      setItems((prev) => prev.map((i) => (i.id === tempId ? created : i)));
    } catch (e) {
      setItems((prev) => prev.filter((i) => i.id !== tempId));
      setError(describeError(e, 'Could not add to watchlist'));
    }
  }, []);

  const updateItem = useCallback(async (id: string, patch: WatchItemPatch) => {
    const snapshot = itemsRef.current;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    try {
      const updated = await api.updateWatchItem(id, patch);
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
    } catch (e) {
      setItems(snapshot);
      setError(describeError(e, 'Could not update watchlist item'));
    }
  }, []);

  const deleteItem = useCallback(async (id: string) => {
    const snapshot = itemsRef.current;
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      await api.removeWatchItem(id);
    } catch (e) {
      setItems(snapshot);
      setError(describeError(e, 'Could not delete watchlist item'));
    }
  }, []);

  const toggleEpisode = useCallback(
    async (watchItemId: string, season: number, episode: number) => {
      const episodeSnapshot = episodeWatchesRef.current;
      const already = episodeSnapshot.find(
        (w) => w.watchItemId === watchItemId && w.seasonNumber === season && w.episodeNumber === episode,
      );

      if (already) {
        setEpisodeWatches((prev) => prev.filter((w) => w !== already));
        try {
          await api.unwatchEpisode(watchItemId, season, episode);
        } catch (e) {
          setEpisodeWatches(episodeSnapshot);
          setError(describeError(e, 'Could not update episode'));
        }
        return;
      }

      const tempId = `temp-episode-watch-${Date.now()}`;
      const optimistic: EpisodeWatch = {
        id: tempId,
        watchItemId,
        seasonNumber: season,
        episodeNumber: episode,
        createdAt: new Date().toISOString(),
      };
      setEpisodeWatches((prev) => [...prev, optimistic]);
      try {
        const response = await api.watchEpisode(watchItemId, season, episode);
        setEpisodeWatches((prev) => prev.map((w) => (w.id === tempId ? response.episodeWatch : w)));
        // The item may have been auto-advanced to 'watched' server-side
        // (finishing the last episode) — sync it from the same response
        // instead of requiring a separate refetch.
        setItems((prev) => prev.map((i) => (i.id === watchItemId ? response.watchItem : i)));
      } catch (e) {
        setEpisodeWatches((prev) => prev.filter((w) => w.id !== tempId));
        setError(describeError(e, 'Could not update episode'));
      }
    },
    [],
  );

  return (
    <WatchContext.Provider
      value={{
        items,
        episodeWatches,
        loading,
        error,
        isEpisodeWatched,
        addItem,
        updateItem,
        deleteItem,
        toggleEpisode,
      }}
    >
      {children}
    </WatchContext.Provider>
  );
}

export function useWatch(): WatchCtx {
  const ctx = useContext(WatchContext);
  if (!ctx) throw new Error('useWatch must be used inside <WatchProvider>');
  return ctx;
}
