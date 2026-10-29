// The process's one offline queue, and the two ways a write tool meets a server
// that is down: creates are queued, everything else changes nothing.

import { join } from 'node:path';
import { api, describeError, isTransient } from './api.ts';
import { apiOrigin, dataDir } from './config.ts';
import { createQueue, type QueueKind } from './queue.ts';
import type {
  JournalEntryInput,
  MoneyEntryInput,
  NoteInput,
  ProjectItemInput,
  ProjectUpdateInput,
  TaskInput,
} from './types.ts';

// What each kind stores: the request body, plus the project id its path needs.
export type QueuedPayload = {
  task: TaskInput;
  journal: JournalEntryInput;
  note: NoteInput;
  money: MoneyEntryInput;
  projectItem: { projectId: string; item: ProjectItemInput };
  projectUpdate: { projectId: string; update: ProjectUpdateInput };
};

// Payloads come back from disk, so the kind is what vouches for the shape.
function send(kind: QueueKind, payload: unknown): Promise<unknown> {
  switch (kind) {
    case 'task':
      return api.createTask(payload as QueuedPayload['task']);
    case 'journal':
      return api.createJournalEntry(payload as QueuedPayload['journal']);
    case 'note':
      return api.createNote(payload as QueuedPayload['note']);
    case 'money':
      return api.createMoney(payload as QueuedPayload['money']);
    case 'projectItem': {
      const { projectId, item } = payload as QueuedPayload['projectItem'];
      return api.createProjectItem(projectId, item);
    }
    case 'projectUpdate': {
      const { projectId, update } = payload as QueuedPayload['projectUpdate'];
      return api.createProjectUpdate(projectId, update);
    }
  }
}

export const queue = createQueue({ dir: join(dataDir, 'queue'), origin: apiOrigin, send, isTransient, describeError });

export const QUEUED_MESSAGE =
  'Queued: the server is unreachable. It will be sent the next time Life Tracker is reachable.';

// Sends a create, or queues it while the server is down. `summary` says what
// was queued, since a queued item is not saved yet and has no id.
export async function createOrQueue<K extends QueueKind, R>(
  kind: K,
  payload: QueuedPayload[K],
  summary: string,
  confirm: (created: R) => string,
): Promise<string> {
  const result = await queue.sendOrQueue(kind, payload);
  if (!result.ok) throw new Error(result.error);
  if (result.queued) return `${QUEUED_MESSAGE}\nNot saved yet: ${summary}`;
  return confirm(result.result as R);
}

// For ticks, edits, moves and upserts, which are never queued: replayed later
// they could undo a change made in the web app in the meantime.
export async function changeNow<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isTransient(e)) throw new Error(`Server unreachable, nothing was changed. (${describeError(e)})`);
    throw e;
  }
}

// A name lookup before a create cannot be queued: the item would have nowhere to go.
export async function lookupForCreate<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isTransient(e)) {
      throw new Error(`${describeError(e)}. Nothing was queued: the name could not be looked up while the server is down.`);
    }
    throw e;
  }
}

// Logged, never thrown: a failed flush must not fail an unrelated tool call.
export async function flushQueue(): Promise<void> {
  try {
    await queue.flush();
  } catch (e) {
    console.error('[life-tracker-mcp] queue flush failed:', e);
  }
}

export async function queueStatusLine(): Promise<string> {
  try {
    const { count, lastError } = await queue.status();
    return `Queue: ${count} waiting${lastError ? ` (last error: ${lastError})` : ''}`;
  } catch (e) {
    return `Queue: could not be read (${describeError(e)})`;
  }
}
