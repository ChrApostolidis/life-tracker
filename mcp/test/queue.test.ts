import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { createQueue, type QueueKind } from '../src/queue.ts';

const ORIGIN = 'https://api.example.test';

class FakeHttpError extends Error {
  transient: boolean;
  constructor(message: string, transient: boolean) {
    super(message);
    this.transient = transient;
  }
}
const down = () => new FakeHttpError('Server unreachable', true);
const rejected = () => new FakeHttpError('400 Bad request', false);

type Mode = 'ok' | 'down' | 'reject';

// A fake server: records every send, and fails per the mode (or per payload).
function fakeServer() {
  const sent: { kind: QueueKind; payload: unknown }[] = [];
  const server = {
    sent,
    mode: 'ok' as Mode,
    modeFor: (_payload: unknown): Mode | undefined => undefined,
    delayMs: 0,
    async send(kind: QueueKind, payload: unknown): Promise<unknown> {
      if (server.delayMs) await new Promise((r) => setTimeout(r, Math.random() * server.delayMs));
      const mode = server.modeFor(payload) ?? server.mode;
      if (mode === 'down') throw down();
      if (mode === 'reject') throw rejected();
      sent.push({ kind, payload });
      return { saved: payload };
    },
  };
  return server;
}

async function tempDir(t: { after: (fn: () => Promise<void>) => void }): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), 'lt-queue-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  return join(base, 'queue'); // not created yet: the queue must cope with that
}

function makeQueue(dir: string, server: ReturnType<typeof fakeServer>, origin = ORIGIN) {
  return createQueue({
    dir,
    origin,
    send: (kind, payload) => server.send(kind, payload),
    isTransient: (e) => e instanceof FakeHttpError && e.transient,
    describeError: (e) => (e instanceof Error ? e.message : String(e)),
  });
}

async function files(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).sort();
  } catch {
    return [];
  }
}

async function readItem(dir: string, name: string) {
  return JSON.parse(await readFile(join(dir, name), 'utf8'));
}

// Queues n items while the server is down; payloads are { n: 1 }, { n: 2 }, …
async function queueWhileDown(dir: string, count: number, origin = ORIGIN) {
  const server = fakeServer();
  server.mode = 'down';
  const queue = makeQueue(dir, server, origin);
  for (let n = 1; n <= count; n++) {
    assert.deepEqual(await queue.sendOrQueue('task', { n }), { ok: true, queued: true });
  }
}

const sentNs = (server: ReturnType<typeof fakeServer>) => server.sent.map((s) => (s.payload as { n: number }).n);

test('a successful send returns the result and queues nothing', async (t) => {
  const dir = await tempDir(t);
  const server = fakeServer();
  const result = await makeQueue(dir, server).sendOrQueue('task', { n: 1 });
  assert.deepEqual(result, { ok: true, queued: false, result: { saved: { n: 1 } } });
  assert.deepEqual(await files(dir), []);
});

test('a transient failure queues one item file', async (t) => {
  const dir = await tempDir(t);
  await queueWhileDown(dir, 1);
  const names = await files(dir);
  assert.equal(names.length, 1);
  assert.match(names[0], /^\d{4}-\d{2}-\d{2}T[\d-]+Z-[0-9a-f-]{36}\.json$/);
  const item = await readItem(dir, names[0]);
  assert.equal(item.kind, 'task');
  assert.deepEqual(item.payload, { n: 1 });
  assert.equal(item.origin, ORIGIN);
  assert.equal(typeof item.id, 'string');
  assert.ok(!Number.isNaN(Date.parse(item.queuedAt)));
});

test('a 4xx is returned as an error and never queued', async (t) => {
  const dir = await tempDir(t);
  const server = fakeServer();
  server.mode = 'reject';
  const result = await makeQueue(dir, server).sendOrQueue('note', { body: 'x' });
  assert.deepEqual(result, { ok: false, error: '400 Bad request' });
  assert.deepEqual(await files(dir), []);
});

test('flush sends oldest first and deletes what it sent', async (t) => {
  const dir = await tempDir(t);
  await queueWhileDown(dir, 3);
  const server = fakeServer();
  assert.equal(await makeQueue(dir, server).flush(), 3);
  assert.deepEqual(sentNs(server), [1, 2, 3]);
  assert.deepEqual(await files(dir), []);
});

test('flush stops at the first transient failure and keeps the rest', async (t) => {
  const dir = await tempDir(t);
  await queueWhileDown(dir, 3);
  const server = fakeServer();
  server.modeFor = (p) => ((p as { n: number }).n === 2 ? 'down' : undefined);
  const queue = makeQueue(dir, server);
  assert.equal(await queue.flush(), 1);
  assert.deepEqual(sentNs(server), [1]);

  const names = await files(dir);
  assert.equal(names.length, 2);
  const [second, third] = await Promise.all(names.map((n) => readItem(dir, n)));
  assert.deepEqual(second.payload, { n: 2 });
  assert.equal(second.lastError, 'Server unreachable');
  assert.equal(third.lastError, undefined, 'the item after the failure was not tried');
  assert.deepEqual(await queue.status(), { count: 2, lastError: 'Server unreachable' });
});

test('a rejected item keeps its error and the flush continues', async (t) => {
  const dir = await tempDir(t);
  await queueWhileDown(dir, 3);
  const server = fakeServer();
  server.modeFor = (p) => ((p as { n: number }).n === 2 ? 'reject' : undefined);
  const queue = makeQueue(dir, server);
  assert.equal(await queue.flush(), 2);
  assert.deepEqual(sentNs(server), [1, 3]);

  const names = await files(dir);
  assert.equal(names.length, 1);
  const kept = await readItem(dir, names[0]);
  assert.deepEqual(kept.payload, { n: 2 });
  assert.equal(kept.lastError, '400 Bad request');
  assert.deepEqual(await queue.status(), { count: 1, lastError: '400 Bad request' });
});

test('items for another origin are neither sent nor counted', async (t) => {
  const dir = await tempDir(t);
  await queueWhileDown(dir, 1, 'http://localhost:8080');
  const before = await files(dir);
  const server = fakeServer();
  const queue = makeQueue(dir, server);
  assert.equal(await queue.flush(), 0);
  assert.deepEqual(server.sent, []);
  assert.deepEqual(await files(dir), before);
  assert.deepEqual(await queue.status(), { count: 0, lastError: null });
});

test('two queues flushing one directory at once send each item exactly once', async (t) => {
  const dir = await tempDir(t);
  await queueWhileDown(dir, 30);
  const server = fakeServer();
  server.delayMs = 5;
  const [a, b] = await Promise.all([makeQueue(dir, server).flush(), makeQueue(dir, server).flush()]);
  assert.equal(a + b, 30);
  assert.deepEqual(sentNs(server).sort((x, y) => x - y), Array.from({ length: 30 }, (_, i) => i + 1));
  assert.deepEqual(await files(dir), []);
});

test('separate processes flushing one directory send each item exactly once', async (t) => {
  const dir = await tempDir(t);
  await queueWhileDown(dir, 30);
  // Each child flushes with a send that appends its payload to a shared log file.
  const log = join(dir, '..', 'sent.log');
  const child = `
    import { appendFile } from 'node:fs/promises';
    import { createQueue } from ${JSON.stringify(new URL('../src/queue.ts', import.meta.url).href)};
    const queue = createQueue({
      dir: ${JSON.stringify(dir)},
      origin: ${JSON.stringify(ORIGIN)},
      send: async (_kind, payload) => {
        await new Promise((r) => setTimeout(r, Math.random() * 5));
        await appendFile(${JSON.stringify(log)}, payload.n + '\\n');
      },
      isTransient: () => true,
      describeError: String,
    });
    process.stdout.write(String(await queue.flush()));
  `;
  const run = () =>
    new Promise<number>((resolve, reject) => {
      execFile(process.execPath, ['--input-type=module', '-e', child], (error, stdout) =>
        error ? reject(error) : resolve(Number(stdout)),
      );
    });
  const counts = await Promise.all([run(), run(), run()]);
  assert.equal(counts.reduce((a, b) => a + b), 30);
  const logged = (await readFile(log, 'utf8')).trim().split('\n').map(Number).sort((x, y) => x - y);
  assert.deepEqual(logged, Array.from({ length: 30 }, (_, i) => i + 1));
  assert.deepEqual(await files(dir), []);
});

test('overlapping flushes in one queue join instead of sending twice', async (t) => {
  const dir = await tempDir(t);
  await queueWhileDown(dir, 5);
  const server = fakeServer();
  server.delayMs = 5;
  const queue = makeQueue(dir, server);
  const [a, b] = await Promise.all([queue.flush(), queue.flush()]);
  assert.equal(a, 5);
  assert.equal(b, 5);
  assert.equal(server.sent.length, 5);
});

test('a stale claim goes back into the queue; a fresh one is left alone', async (t) => {
  const dir = await tempDir(t);
  await queueWhileDown(dir, 2);
  const [first, second] = await files(dir);
  // Claims left by a process that is not this one: one died 11 minutes ago, one is mid-send.
  const staleLock = join(dir, `${first}.sending`);
  const freshLock = join(dir, `${second}.sending`);
  await writeFile(staleLock, '99999');
  await writeFile(freshLock, '99999');
  const elevenMinutesAgo = new Date(Date.now() - 11 * 60_000);
  await utimes(staleLock, elevenMinutesAgo, elevenMinutesAgo);

  const server = fakeServer();
  const queue = makeQueue(dir, server);
  assert.equal(await queue.flush(), 1);
  assert.deepEqual(sentNs(server), [1]);
  assert.deepEqual(await files(dir), [second, `${second}.sending`]);
  assert.deepEqual(await queue.status(), { count: 1, lastError: null }, 'a claimed item still counts');
});

test('a corrupt item file does not stop the flush and is reported, not deleted', async (t) => {
  const dir = await tempDir(t);
  await queueWhileDown(dir, 1);
  const corrupt = '2000-01-01T00-00-00-000Z-00000000-0000-4000-8000-000000000000.json';
  await writeFile(join(dir, corrupt), '{not json');

  const server = fakeServer();
  const queue = makeQueue(dir, server);
  assert.equal(await queue.flush(), 1);
  assert.deepEqual(sentNs(server), [1]);
  assert.deepEqual(await files(dir), [corrupt]);

  const { count, lastError } = await queue.status();
  assert.equal(count, 1);
  assert.match(lastError ?? '', new RegExp(`Unreadable queue file ${corrupt}`));
});

test('status counts this origin only and ignores stray files', async (t) => {
  const dir = await tempDir(t);
  const queue = makeQueue(dir, fakeServer());
  assert.deepEqual(await queue.status(), { count: 0, lastError: null }, 'a missing directory is an empty queue');
  assert.equal(await queue.flush(), 0);

  await queueWhileDown(dir, 2);
  await queueWhileDown(dir, 1, 'http://localhost:8080');
  await writeFile(join(dir, 'notes.txt'), 'hello');
  await writeFile(join(dir, 'leftover.json.tmp-1-abc'), '{');
  assert.deepEqual(await queue.status(), { count: 2, lastError: null });
});
