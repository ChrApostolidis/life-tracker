import { z } from 'zod';
import { api, ApiError, describeError, getToken } from '../api.ts';
import { apiOrigin, isProduction, timezone } from '../config.ts';
import { queueStatusLine } from '../offline.ts';
import type { DefineTool } from '../server.ts';

const LOGIN_HINT = 'Run: node mcp/dist/cli.js login';

// Shared with `cli.js status`.
export async function statusLines(): Promise<string[]> {
  const token = await getToken();
  const lines = [`API: ${apiOrigin} (${isProduction ? 'production' : 'dev'})`, `Time zone: ${timezone}`];
  try {
    await api.me();
    lines.push(
      'Server: reachable',
      token
        ? 'Login: token stored, the server says signed in'
        : 'Login: no token stored; the server is not enforcing auth, so it answers without one',
    );
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      lines.push(
        'Server: reachable',
        token ? `Login: the stored token was rejected. ${LOGIN_HINT}` : `Login: not logged in. ${LOGIN_HINT}`,
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
