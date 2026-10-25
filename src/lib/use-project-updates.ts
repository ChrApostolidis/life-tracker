'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectUpdate, ProjectUpdateInput, ProjectUpdatePatch } from './types';
import { api, describeError } from './api';
import { toDateInput } from './date';

// Newest first, the server's order: entryDate desc, then createdAt desc.
function sortUpdates(list: ProjectUpdate[]): ProjectUpdate[] {
  return [...list].sort(
    (a, b) =>
      b.entryDate.localeCompare(a.entryDate) || Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

// One project's progress log for the Updates tab. Optimistic with rollback.
export function useProjectUpdates(projectId: string) {
  const [updates, setUpdates] = useState<ProjectUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const updatesRef = useRef<ProjectUpdate[]>(updates);
  useEffect(() => {
    updatesRef.current = updates;
  }, [updates]);

  useEffect(() => {
    let cancelled = false;
    // Reset first so another project's log never shows under this id.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUpdates([]);
    setLoading(true);
    setError(null);
    api
      .listProjectUpdates(projectId)
      .then((list) => {
        if (!cancelled) setUpdates(sortUpdates(list));
      })
      .catch((e) => {
        if (!cancelled) setError(describeError(e, 'Could not load updates'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const addUpdate = useCallback(
    async (input: ProjectUpdateInput): Promise<boolean> => {
      const tempId = `temp-update-${Date.now()}`;
      const nowIso = new Date().toISOString();
      const optimistic: ProjectUpdate = {
        id: tempId,
        projectId,
        body: input.body,
        entryDate: input.entryDate ?? toDateInput(new Date()),
        source: input.source ?? 'text',
        rawTranscript: input.rawTranscript ?? null,
        deletedAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      setUpdates((prev) => sortUpdates([optimistic, ...prev]));
      try {
        const created = await api.createProjectUpdate(projectId, input);
        setUpdates((prev) => sortUpdates(prev.map((u) => (u.id === tempId ? created : u))));
        return true;
      } catch (e) {
        setUpdates((prev) => prev.filter((u) => u.id !== tempId));
        setError(describeError(e, 'Could not save that update'));
        return false;
      }
    },
    [projectId],
  );

  const updateUpdate = useCallback(
    async (id: string, patch: ProjectUpdatePatch): Promise<boolean> => {
      const snapshot = updatesRef.current;
      setUpdates((prev) => sortUpdates(prev.map((u) => (u.id === id ? { ...u, ...patch } : u))));
      try {
        const saved = await api.updateProjectUpdate(id, patch);
        setUpdates((prev) => sortUpdates(prev.map((u) => (u.id === id ? saved : u))));
        return true;
      } catch (e) {
        setUpdates(snapshot);
        setError(describeError(e, 'Could not save that update'));
        return false;
      }
    },
    [],
  );

  const deleteUpdate = useCallback(async (id: string): Promise<boolean> => {
    const snapshot = updatesRef.current;
    setUpdates((prev) => prev.filter((u) => u.id !== id));
    try {
      await api.removeProjectUpdate(id);
      return true;
    } catch (e) {
      setUpdates(snapshot);
      setError(describeError(e, 'Could not delete that update'));
      return false;
    }
  }, []);

  return { updates, loading, error, addUpdate, updateUpdate, deleteUpdate };
}
