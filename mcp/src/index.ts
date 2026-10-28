// stdio entry, started by Claude itself. stdout carries only the protocol;
// anything else goes to stderr.

import './config.ts'; // first: sets process.env.TZ before any Date work
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { flushQueue } from './offline.ts';
import { buildServer } from './server.ts';

serveStdio(() => buildServer(), {
  onerror: (error) => console.error('[life-tracker-mcp]', error),
});
// Not awaited: the transport must answer Claude straight away, server down or not.
void flushQueue();
