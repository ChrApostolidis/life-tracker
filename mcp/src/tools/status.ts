import { z } from 'zod';
import { api, ApiError, describeError, getToken, loginHint } from '../api.ts';
import { apiOrigin, isProduction, runtime, timezone } from '../config.ts';
import { queueStatusLine } from '../offline.ts';
import type { DefineTool } from '../server.ts';

// Shared with `cli.js status`.
export async function statusLines(): Promise<string[]> {
  const token = await getToken();
  const lines = [`API: ${apiOrigin} (${isProduction ? 'production' : 'dev'})`, `Time zone: ${timezone}`];
  try {
    await api.me();
    lines.push(
      'Server: reachable',
      runtime.hosted
        ? 'Login: signed in through the connector'
        : token
        ? 'Login: token stored, the server says signed in'
        : 'Login: no token stored; the server is not enforcing auth, so it answers without one',
    );
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      lines.push(
        'Server: reachable',
        token ? `Login: the token was rejected. ${loginHint()}` : `Login: not logged in. ${loginHint()}`,
      );
    } else {
      lines.push(`Server: ${describeError(e)}`, token ? 'Login: token stored (not checked)' : 'Login: no token stored');
    }
  }
  lines.push(await queueStatusLine());
  return lines;
}

export function registerStatusTools(defineTool: DefineTool): void {
  defineTool(
    'status',
    {
      description:
        'Health of the Life Tracker connection: which API URL is in use (production or dev), whether the server is reachable, whether this machine is logged in, and how many creates are queued offline waiting to be sent. Call it when another tool reports an error.',
      input: z.object({}),
      readOnly: true,
    },
    async () => (await statusLines()).join('\n'),
  );
}
