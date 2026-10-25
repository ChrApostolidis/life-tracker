'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ProjectItem,
  ProjectItemInput,
  ProjectItemPatch,
  ProjectStage,
} from './types';
import { api, describeError } from './api';
import { STAGES } from './projects';

// Positions are gapped by 1024 server-side; local guesses use the same step.
const POSITION_STEP = 1024;

// Board order: stage by STAGES, then position within the stage.
function sortItems(list: ProjectItem[]): ProjectItem[] {
  return [...list].sort(
    (a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || a.position - b.position,
  );
}

// The local guess at a move, mirroring the server's rules. The server's answer replaces it.
function applyMove(
  items: ProjectItem[],
  id: string,
  stage: ProjectStage,
  index: number,
  nowIso: string,
): ProjectItem[] {
  const item = items.find((i) => i.id === id);
  if (!item) return items;
  const rest = items.filter((i) => i.id !== id);
  const column = rest.filter((i) => i.stage === stage);
  const completedAt = stage !== 'done' ? null : item.stage === 'done' ? item.completedAt : nowIso;
  column.splice(Math.max(0, Math.min(index, column.length)), 0, { ...item, stage, completedAt });
  const renumbered = column.map((i, n) => ({ ...i, position: (n + 1) * POSITION_STEP }));
  return sortItems([...rest.filter((i) => i.stage !== stage), ...renumbered]);
}

// One project's board for /project/[id]. Every mutation is optimistic and
// rolls back to a snapshot on failure.
export function useProjectItems(projectId: string) {
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Only the latest move's answer may land, so a slow earlier one can't undo a later drag.
  const moveSeq = useRef(0);

  const itemsRef = useRef<ProjectItem[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    let cancelled = false;
    // Reset first so another project's board never shows under this id.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems([]);
    setLoading(true);
    setError(null);
    api
      .listProjectItems(projectId)
      .then((list) => {
        if (!cancelled) setItems(sortItems(list));
      })
      .catch((e) => {
        if (!cancelled) setError(describeError(e, 'Could not load this board'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const addItem = useCallback(
    async (input: ProjectItemInput): Promise<boolean> => {
      const tempId = `temp-item-${Date.now()}`;
      const nowIso = new Date().toISOString();
      const stage = input.stage ?? 'todo';
      const inStage = itemsRef.current.filter((i) => i.stage === stage);
      const optimistic: ProjectItem = {
        id: tempId,
        projectId,
        title: input.title,
        description: input.description ?? null,
        stage,
        priority: input.priority ?? 'normal',
        dueOn: input.dueOn ?? null,
        position: Math.max(0, ...inStage.map((i) => i.position)) + POSITION_STEP,
        completedAt: stage === 'done' ? nowIso : null,
        deletedAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      setItems((prev) => sortItems([...prev, optimistic]));
      try {
        const created = await api.createProjectItem(projectId, input);
        setItems((prev) => sortItems(prev.map((i) => (i.id === tempId ? created : i))));
        return true;
      } catch (e) {
        setItems((prev) => prev.filter((i) => i.id !== tempId));
        setError(describeError(e, 'Could not add that item'));
        return false;
      }
    },
    [projectId],
  );

  // Shared by updateItem and clearDue: optimistic local change, then the server's row.
  const editItem = useCallback(
    async (
      id: string,
      local: Partial<ProjectItem>,
      save: () => Promise<ProjectItem>,
      failure: string,
    ): Promise<boolean> => {
      const snapshot = itemsRef.current;
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...local } : i)));
      try {
        const saved = await save();
        setItems((prev) => sortItems(prev.map((i) => (i.id === id ? saved : i))));
        return true;
      } catch (e) {
        setItems(snapshot);
        setError(describeError(e, failure));
        return false;
      }
    },
    [],
  );

  const updateItem = useCallback(
    (id: string, patch: ProjectItemPatch) =>
      editItem(id, patch, () => api.updateProjectItem(id, patch), 'Could not update that item'),
    [editItem],
  );

  const clearDue = useCallback(
    (id: string) =>
      editItem(id, { dueOn: null }, () => api.clearProjectItemDue(id), 'Could not clear the due date'),
    [editItem],
  );

  const moveItem = useCallback(
    async (id: string, stage: ProjectStage, index: number): Promise<boolean> => {
      const seq = ++moveSeq.current;
      const snapshot = itemsRef.current;
      setItems((prev) => applyMove(prev, id, stage, index, new Date().toISOString()));
      try {
        const board = await api.moveProjectItem(id, { stage, index });
        if (seq === moveSeq.current) setItems(sortItems(board));
        return true;
      } catch (e) {
        if (seq === moveSeq.current) setItems(snapshot);
        setError(describeError(e, 'Could not move that item'));
        return false;
      }
    },
    [],
  );

  const deleteItem = useCallback(async (id: string): Promise<boolean> => {
    const snapshot = itemsRef.current;
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      await api.removeProjectItem(id);
      return true;
    } catch (e) {
      setItems(snapshot);
      setError(describeError(e, 'Could not delete that item'));
      return false;
    }
  }, []);

  return { items, loading, error, addItem, updateItem, clearDue, moveItem, deleteItem };
}
