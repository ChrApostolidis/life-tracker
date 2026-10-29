// Named workflows, shown in Claude Code as /mcp__life-tracker__<name>. Each is
// one user message saying which tools to read with and what to produce.

import type { GetPromptResult, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { addDays, fromDateInput, isDateString, today, toDateInput } from './dates.ts';

// Every workflow ends in writes, and a chat should never change the life log unasked.
const ASK_FIRST =
  'Do not write anything yet. Propose every change as a numbered list first and wait for my yes before calling any write tool. ' +
  'If a write answers "Queued", tell me it is not saved yet.';

function message(text: string): GetPromptResult {
  return { messages: [{ role: 'user', content: { type: 'text', text: `${text}\n\n${ASK_FIRST}` } }] };
}

// Monday of the week holding the date.
function mondayOf(date: string): string {
  const d = fromDateInput(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toDateInput(d);
}

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'plan-tomorrow',
    { title: 'Plan tomorrow', description: "Read tomorrow, overdue and the inbox, then plan tomorrow's schedule with me." },
    () => {
      const tomorrow = addDays(today(), 1);
      return message(
        `Help me plan tomorrow, ${tomorrow}. Call get_day for ${tomorrow}, then list_overdue and list_inbox. ` +
          'Summarise what is already scheduled, what is overdue and what is waiting in the inbox. ' +
          'Then ask me what else is coming tomorrow before you propose anything. ' +
          'After I answer, propose a schedule: times for the tasks worth doing (add_task / edit_task), and what to leave for later.',
      );
    },
  );

  server.registerPrompt(
    'weekly-review',
    {
      title: 'Weekly review',
      description: 'A week of tasks, habits, sleep, gym, journal and money: what went well, what slipped, one thing to change.',
      argsSchema: z.object({
        weekOf: z.string().optional().describe('Any day in the week to review, YYYY-MM-DD. Default: the last 7 days.'),
      }),
    },
    ({ weekOf }) => {
      if (weekOf !== undefined && !isDateString(weekOf)) throw new Error('weekOf must be a date as YYYY-MM-DD.');
      const from = weekOf ? mondayOf(weekOf) : addDays(today(), -6);
      const to = addDays(from, 7);
      return message(
        `Run my weekly review for ${from} to ${to} (exclusive). Read the week with list_tasks, get_habits, get_sleep, list_workouts, search_journal and get_money for that range ` +
          '(get_sleep counts back from today, so ask for enough days to cover it). ' +
          'Then write a short review: what went well, what slipped (tasks left open, habits missed, short nights), and patterns across sleep, gym and habits worth noticing. ' +
          'End with one concrete thing to change next week. If I want to keep the review, offer to save it with write_journal_entry tagged weekly-review.',
      );
    },
  );

  server.registerPrompt(
    'inbox-triage',
    { title: 'Inbox triage', description: 'Walk the inbox one item at a time: schedule, rename or leave.' },
    () =>
      message(
        'Help me empty my inbox. Call list_inbox, then go through the items one at a time, oldest first. ' +
          'For each, suggest one of: schedule it (a date, and a time if it needs one), rename it so it says what to do, mark it done, or leave it. ' +
          'Wait for my answer on each item before moving to the next, and collect the decisions. ' +
          'At the end show the full list of changes (edit_task / set_task_done) and apply them only when I confirm.',
      ),
  );

  server.registerPrompt(
    'evening-journal',
    { title: 'Evening journal', description: "Read today and the last few entries, then help write tonight's journal entry." },
    () =>
      message(
        `Help me write tonight's journal entry for ${today()}. Call get_day for today and search_journal for the last 7 days. ` +
          'Briefly reflect back what today held (tasks done and open, habits, sleep, the day log) and ask me two or three short questions about the day. ' +
          'From my answers, draft the entry in my own words, not yours, with a title and a few tags. ' +
          'Show me the draft, and save it with write_journal_entry only once I approve it.',
      ),
  );
}
