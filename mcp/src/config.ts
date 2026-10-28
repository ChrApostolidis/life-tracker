import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_API_URL = 'https://lifetrackerapi.christosapostolidis.com';
const DEFAULT_TIMEZONE = 'Europe/Athens';

// Reduced to its origin, the extension's rule: a pasted path once caused /api/api/... 404s.
function toOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    throw new Error(`LT_API_URL is not a valid URL: ${url}`);
  }
}

function checkTimezone(zone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    throw new Error(`LT_TIMEZONE is not a known time zone: ${zone}`);
  }
}

export const apiOrigin = toOrigin(process.env.LT_API_URL?.trim() || DEFAULT_API_URL);
export const apiHost = new URL(apiOrigin).host;
export const isProduction = apiOrigin === toOrigin(DEFAULT_API_URL);

// Set before any Date work so "today" and local midnight match the backend's
// app.timezone, also on a UTC container. An unknown TZ would silently mean UTC.
export const timezone = checkTimezone(process.env.LT_TIMEZONE?.trim() || DEFAULT_TIMEZONE);
process.env.TZ = timezone;

export const dataDir =
  process.platform === 'win32'
    ? join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'life-tracker-mcp')
    : join(homedir(), '.config', 'life-tracker-mcp');
