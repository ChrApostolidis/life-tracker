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
import type { Project, ProjectInput, ProjectPatch, ProjectSummary } from './types';
import { api, describeError } from './api';

type ProjectsCtx = {
  summaries: ProjectSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addProject: (input: ProjectInput) => Promise<Project | null>;
  updateProject: (id: string, patch: ProjectPatch) => Promise<boolean>;
  deleteProject: (id: string) => Promise<boolean>;
};

const ProjectsContext = createContext<ProjectsCtx | null>(null);

function byActivityDesc(list: ProjectSummary[]): ProjectSummary[] {
  return [...list].sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));
}

function latest(a: string, b: string): string {
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

// Books-context pattern: whole list loads once, mutations are optimistic with
// rollback. refresh() is public because the board changes counts this provider
// can't see; the project page calls it once on the way out.
export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [summaries, setSummaries] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const summariesRef = useRef<ProjectSummary[]>(summaries);
  useEffect(() => {
    summariesRef.current = summaries;
  }, [summaries]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummaries(await api.listProjects());
    } catch (e) {
      setError(describeError(e, 'Could not load projects'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const addProject = useCallback(async (input: ProjectInput): Promise<Project | null> => {
    const tempId = `temp-project-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const optimistic: ProjectSummary = {
      project: {
        id: tempId,
        name: input.name,
        pitch: input.pitch ?? null,
        description: input.description ?? null,
        status: input.status,
        repoUrl: null,
        liveUrl: null,
        techStack: null,
        startedOn: null,
        finishedOn: null,
        deletedAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      counts: { todo: 0, doing: 0, done: 0, blocked: 0 },
      lastActivityAt: nowIso,
    };
    // Newest activity first, matching the backend's ordering.
    setSummaries((prev) => [optimistic, ...prev]);
    try {
      const created = await api.createProject(input);
      setSummaries((prev) =>
        prev.map((s) =>
          s.project.id === tempId ? { ...s, project: created, lastActivityAt: created.updatedAt } : s,
        ),
      );
      return created;
    } catch (e) {
      setSummaries((prev) => prev.filter((s) => s.project.id !== tempId));
      setError(describeError(e, 'Could not add project'));
      return null;
    }
  }, []);

  const updateProject = useCallback(async (id: string, patch: ProjectPatch): Promise<boolean> => {
    const snapshot = summariesRef.current;
    const nowIso = new Date().toISOString();
    setSummaries((prev) =>
      byActivityDesc(
        prev.map((s) =>
          s.project.id === id
            ? { ...s, project: { ...s.project, ...patch }, lastActivityAt: nowIso }
            : s,
        ),
      ),
    );
    try {
      const updated = await api.updateProject(id, patch);
      // The summary's activity may already be later than the project row (an item edit).
      const before = snapshot.find((s) => s.project.id === id)?.lastActivityAt ?? updated.updatedAt;
      setSummaries((prev) =>
        byActivityDesc(
          prev.map((s) =>
            s.project.id === id
              ? { ...s, project: updated, lastActivityAt: latest(before, updated.updatedAt) }
              : s,
          ),
        ),
      );
      return true;
    } catch (e) {
      setSummaries(snapshot);
      setError(describeError(e, 'Could not update project'));
      return false;
    }
  }, []);

  const deleteProject = useCallback(async (id: string): Promise<boolean> => {
    const snapshot = summariesRef.current;
    setSummaries((prev) => prev.filter((s) => s.project.id !== id));
    try {
      await api.removeProject(id);
      return true;
    } catch (e) {
      setSummaries(snapshot);
      setError(describeError(e, 'Could not delete project'));
      return false;
    }
  }, []);

  return (
    <ProjectsContext.Provider
      value={{ summaries, loading, error, refresh, addProject, updateProject, deleteProject }}
    >
      {children}
    </ProjectsContext.Provider>
  );
}

export function useProjects(): ProjectsCtx {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error('useProjects must be used inside <ProjectsProvider>');
  return ctx;
}
