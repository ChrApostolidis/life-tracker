import { McpServer } from '@modelcontextprotocol/server';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/server';
import type { z } from 'zod';
import { describeError } from './api.ts';
import { apiHost, isProduction, timezone } from './config.ts';
import { flushQueue } from './offline.ts';
import { registerPrompts } from './prompts.ts';
import { registerGymTools } from './tools/gym.ts';
import { registerHabitTools } from './tools/habits.ts';
import { registerJournalTools } from './tools/journal.ts';
import { registerMoneyTools } from './tools/money.ts';
import { registerNoteTools } from './tools/notes.ts';
import { registerProjectTools } from './tools/projects.ts';
import { registerSleepTools } from './tools/sleep.ts';
import { registerStatusTools } from './tools/status.ts';
import { registerTaskTools } from './tools/tasks.ts';

export type ToolSpec<S extends z.ZodObject> = {
  description: string;
  input: S;
  // Read tools carry readOnlyHint, so Claude Code can allow reads and ask for writes.
  readOnly: boolean;
  annotations?: Omit<ToolAnnotations, 'readOnlyHint'>;
};

// A handler returns the result text; throwing turns into an isError result.
export type ToolHandler<S extends z.ZodObject> = (args: z.output<S>) => Promise<string>;

export type DefineTool = <S extends z.ZodObject>(name: string, spec: ToolSpec<S>, handler: ToolHandler<S>) => void;

// Writing to the dev database by mistake should be visible in the transcript.
const prefix = isProduction ? '' : `[dev: ${apiHost}]\n`;

function textResult(text: string, isError = false): CallToolResult {
  return { content: [{ type: 'text', text: prefix + text }], isError };
}

// Runs before every tool call, the one place for it. Must not throw: a failure
// here would fail a tool call that has nothing to do with it.
async function beforeEachCall(): Promise<void> {
  await flushQueue();
}

function toolDefiner(server: McpServer): DefineTool {
  return (name, spec, handler) => {
    server.registerTool(
      name,
      {
        description: spec.description,
        inputSchema: spec.input as z.ZodObject,
        annotations: { ...spec.annotations, readOnlyHint: spec.readOnly },
      },
      async (args) => {
        try {
          await beforeEachCall();
          return textResult(await handler(args as z.output<typeof spec.input>));
        } catch (e) {
          return textResult(describeError(e), true);
        }
      },
    );
  };
}

export function buildServer(): McpServer {
  const server = new McpServer(
    { name: 'life-tracker', version: '0.1.0' },
    {
      instructions:
        `Life Tracker: the owner's tasks, habits, journal, sleep, gym, projects and money. ` +
        `Dates are local YYYY-MM-DD and times HH:MM 24-hour, in ${timezone}. ` +
        `Results show ids as [id:…]; pass them back to address a row. ` +
        `For "how is today going" call get_day. ` +
        `A write answering "Queued" is not saved yet: say so, never report it as saved.`,
    },
  );
  const defineTool = toolDefiner(server);
  for (const register of [
    registerStatusTools,
    registerTaskTools,
    registerHabitTools,
    registerJournalTools,
    registerSleepTools,
    registerProjectTools,
    registerGymTools,
    registerMoneyTools,
    registerNoteTools,
  ]) {
    register(defineTool);
  }
  registerPrompts(server);
  return server;
}
