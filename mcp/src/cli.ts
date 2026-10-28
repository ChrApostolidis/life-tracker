// `node mcp/dist/cli.js login | logout | status`. Run by hand in a terminal,
// so unlike the server it may write to stdout.

import { api, ApiError, describeError, describeLoginError, getToken, setToken } from './api.ts';
import { apiOrigin } from './config.ts';
import { statusLines } from './tools/status.ts';

// Reads a line from the terminal without echoing it.
function promptHidden(question: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) return Promise.reject(new Error('login needs an interactive terminal to ask for the password.'));
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          finish();
          resolve(value);
          return;
        }
        if (ch === '\u0003' || ch === '\u0004') {
          finish();
          reject(new Error('Cancelled.'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') value = [...value].slice(0, -1).join('');
        else value += ch;
      }
    };
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
    stdin.resume();
  });
}

async function login(): Promise<void> {
  const password = await promptHidden(`Life Tracker password for ${apiOrigin}: `);
  if (!password) throw new Error('No password given.');
  let response;
  try {
    response = await api.login(password);
  } catch (e) {
    throw new Error(describeLoginError(e));
  }
  // Only the token is kept; the password is never stored.
  if (!response?.token) throw new Error('The server answered without a token, so nothing was saved.');
  await setToken(response.token);
  console.log('Logged in.');
}

// Revoke on the server first, then drop the token, the web app's rule: a failed
// revoke would otherwise leave a live session nobody holds.
async function logout(): Promise<void> {
  if (!(await getToken())) {
    console.log('Not logged in.');
    return;
  }
  try {
    await api.logout();
  } catch (e) {
    // A 401 means the session is already dead, so there is nothing left to revoke.
    if (!(e instanceof ApiError && e.status === 401)) {
      throw new Error(`${describeError(e)}. Still logged in; try again later.`);
    }
  }
  await setToken(null);
  console.log('Logged out.');
}

async function status(): Promise<void> {
  console.log((await statusLines()).join('\n'));
}

const commands: Record<string, () => Promise<void>> = { login, logout, status };
const name = process.argv[2] ?? '';
const command = Object.hasOwn(commands, name) ? commands[name] : undefined;

if (!command) {
  console.error('Usage: node mcp/dist/cli.js login | logout | status');
  process.exitCode = 1;
} else {
  command().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  });
}
