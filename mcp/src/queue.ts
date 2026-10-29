// Creates that could not be sent yet, one file per item so several MCP server
// processes (one per Claude session) can share the queue without a shared array.
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

export type QueueKind = 'task' | 'journal' | 'note' | 'money' | 'projectItem' | 'projectUpdate';

export type SendResult =
  | { ok: true; queued: false; result: unknown }
  | { ok: true; queued: true }
  | { ok: false; error: string };

export type QueueItem = {
  id: string;
  kind: QueueKind;
  payload: unknown;
  origin: string;
  queuedAt: string;
  lastError?: string;
};

export type QueueOptions = {
  dir: string;
  origin: string;
  send: (kind: QueueKind, payload: unknown) => Promise<unknown>;
  isTransient: (e: unknown) => boolean;
  describeError: (e: unknown) => string;
  now?: () => number;
  staleMs?: number;
};

export type Queue = {
  sendOrQueue(kind: QueueKind, payload: unknown): Promise<SendResult>;
  flush(): Promise<number>;
  status(): Promise<{ count: number; lastError: string | null }>;
};

const KINDS: ReadonlySet<string> = new Set(['task', 'journal', 'note', 'money', 'projectItem', 'projectUpdate']);
const ITEM_NAME =
  /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/;
const LOCK_SUFFIX = '.sending';
const DEFAULT_STALE_MS = 10 * 60_000;
// Windows refuses to rename over or delete a file another process has open,
// e.g. a second server reading it before deciding to claim it. That clears fast.
const LOCKED = new Set(['EPERM', 'EACCES', 'EBUSY']);

function errorCode(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null && 'code' in e ? String(e.code) : undefined;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function retryLocked<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= 5 || !LOCKED.has(errorCode(e) ?? '')) throw e;
      await sleep(attempt * 20);
    }
  }
}

async function unlinkIfThere(path: string): Promise<void> {
  try {
    await retryLocked(() => unlink(path));
  } catch (e) {
    if (errorCode(e) !== 'ENOENT') throw e;
  }
}

// Windows forbids ':' in file names; this form still sorts chronologically.
function fileStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[:.]/g, '-');
}

function parseItem(text: string): QueueItem {
  const item: unknown = JSON.parse(text);
  if (
    typeof item !== 'object' || item === null ||
    !('id' in item) || typeof item.id !== 'string' ||
    !('kind' in item) || typeof item.kind !== 'string' || !KINDS.has(item.kind) ||
    !('origin' in item) || typeof item.origin !== 'string' ||
    !('queuedAt' in item) || typeof item.queuedAt !== 'string' ||
    !('payload' in item)
  ) {
    throw new Error('not a queue item');
  }
  return item as QueueItem;
}

// Null when the item is gone or unreadable. An unreadable file is left in
// place for status() to report: deleting it would throw away a capture.
async function readItem(path: string): Promise<QueueItem | null> {
  try {
    return parseItem(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

// A temp file in the same directory, then a rename: a crash mid-write leaves
// a stray temp file, never a half-written item.
async function writeAtomic(path: string, item: QueueItem): Promise<void> {
  const tmp = `${path}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(tmp, JSON.stringify(item));
    await retryLocked(() => rename(tmp, path));
  } catch (e) {
    await unlink(tmp).catch(() => {});
    throw e;
  }
}

async function listDir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch (e) {
    if (errorCode(e) === 'ENOENT') return [];
    throw e;
  }
}

// Exclusive create succeeds for exactly one caller, across processes too, so
// whoever creates <item>.sending is the only one allowed to send that item.
// (Not rename: on Windows two racing renames of one file can both succeed.)
async function claim(lockPath: string): Promise<boolean> {
  try {
    await writeFile(lockPath, String(process.pid), { flag: 'wx' });
    return true;
  } catch (e) {
    if (errorCode(e) === 'EEXIST' || LOCKED.has(errorCode(e) ?? '')) return false;
    throw e;
  }
}

export function createQueue(opts: QueueOptions): Queue {
  const { dir, origin, send, isTransient, describeError } = opts;
  const now = opts.now ?? Date.now;
  const staleMs = opts.staleMs ?? DEFAULT_STALE_MS;

  // Keeps file names strictly increasing within this process, so two items
  // queued in the same millisecond still flush in the order they came.
  let lastStamp = 0;
  function nextStamp(): number {
    lastStamp = Math.max(now(), lastStamp + 1);
    return lastStamp;
  }

  async function sendOrQueue(kind: QueueKind, payload: unknown): Promise<SendResult> {
    try {
      return { ok: true, queued: false, result: await send(kind, payload) };
    } catch (e) {
      // A 4xx means the request itself is wrong; retrying it would never help.
      if (!isTransient(e)) return { ok: false, error: describeError(e) };
      const stamp = nextStamp();
      const id = randomUUID();
      const item: QueueItem = { id, kind, payload, origin, queuedAt: new Date(stamp).toISOString() };
      try {
        await mkdir(dir, { recursive: true });
        await writeAtomic(join(dir, `${fileStamp(stamp)}-${id}.json`), item);
      } catch (writeError) {
        return {
          ok: false,
          error: `${describeError(e)}, and it could not be queued: ${errorMessage(writeError)}`,
        };
      }
      return { ok: true, queued: true };
    }
  }

  // A lock older than staleMs belongs to a process that died mid-send; removing
  // it puts the item back in line.
  async function recoverStale(): Promise<void> {
    for (const name of await listDir(dir)) {
      if (!name.endsWith(LOCK_SUFFIX) || !ITEM_NAME.test(name.slice(0, -LOCK_SUFFIX.length))) continue;
      const lockPath = join(dir, name);
      try {
        if (now() - (await stat(lockPath)).mtimeMs < staleMs) continue;
      } catch (e) {
        if (errorCode(e) === 'ENOENT') continue;
        throw e;
      }
      await unlinkIfThere(lockPath);
    }
  }

  async function runFlush(): Promise<number> {
    await recoverStale();
    const names = (await listDir(dir)).filter((name) => ITEM_NAME.test(name)).sort();
    let sent = 0;
    for (const name of names) {
      const path = join(dir, name);
      const lockPath = path + LOCK_SUFFIX;
      // Checked before claiming, so another origin's process never finds its items locked.
      const peek = await readItem(path);
      if (!peek || peek.origin !== origin || !(await claim(lockPath))) continue;

      try {
        // Re-read under the lock: it may have been sent and removed in between.
        const item = await readItem(path);
        if (!item) continue;
        try {
          await send(item.kind, item.payload);
        } catch (e) {
          await writeAtomic(path, { ...item, lastError: describeError(e) });
          // Transient: the server is evidently still down, so stop. Otherwise the
          // item keeps its error and the rest still get their turn.
          if (isTransient(e)) break;
          continue;
        }
        await unlinkIfThere(path);
        sent++;
      } finally {
        await unlinkIfThere(lockPath);
      }
    }
    return sent;
  }

  // Overlapping calls in one process join the flush already running.
  let inFlight: Promise<number> | null = null;
  function flush(): Promise<number> {
    inFlight ??= runFlush().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  async function status(): Promise<{ count: number; lastError: string | null }> {
    let count = 0;
    // Each error with its file's mtime: the file is rewritten whenever an error is recorded.
    const errors: { at: number; error: string }[] = [];

    for (const name of await listDir(dir)) {
      if (!ITEM_NAME.test(name)) continue;
      const path = join(dir, name);
      let text: string;
      let modified: number;
      try {
        [text, modified] = await Promise.all([readFile(path, 'utf8'), stat(path).then((s) => s.mtimeMs)]);
      } catch (e) {
        if (errorCode(e) === 'ENOENT') continue; // sent between listing and reading
        count++;
        errors.push({ at: Date.now(), error: `Unreadable queue file ${name}: ${errorMessage(e)}` });
        continue;
      }
      let item: QueueItem;
      try {
        item = parseItem(text);
      } catch (e) {
        count++;
        errors.push({ at: modified, error: `Unreadable queue file ${name}: ${errorMessage(e)}` });
        continue;
      }
      if (item.origin !== origin) continue;
      count++;
      if (item.lastError) errors.push({ at: modified, error: item.lastError });
    }
    const latest = errors.reduce<(typeof errors)[number] | null>((a, b) => (a && a.at >= b.at ? a : b), null);
    return { count, lastError: latest?.error ?? null };
  }

  return { sendOrQueue, flush, status };
}
