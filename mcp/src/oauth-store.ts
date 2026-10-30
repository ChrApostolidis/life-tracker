// Persists the OAuth state as one JSON file in the data dir (a volume in the
// container). Loaded once at startup; this process is its only writer.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dataDir } from './config.ts';
import type { OAuthState } from './oauth.ts';

const FILE = join(dataDir, 'oauth.json');

export async function loadOAuthState(): Promise<OAuthState> {
  let text: string;
  try {
    text = await readFile(FILE, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { clients: [], grants: [] };
    throw e;
  }
  try {
    return JSON.parse(text) as OAuthState;
  } catch {
    throw new Error(`${FILE} is not valid JSON. Delete it; every connector then logs in again.`);
  }
}

// Writes are chained so two saves never interleave, and go through a temp
// file so a crash mid-write cannot leave half a file.
let pending: Promise<void> = Promise.resolve();

export function saveOAuthState(state: OAuthState): Promise<void> {
  const write = async () => {
    await mkdir(dataDir, { recursive: true });
    const temp = `${FILE}.tmp`;
    await writeFile(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
    await rename(temp, FILE);
  };
  pending = pending.then(write, write);
  return pending;
}
