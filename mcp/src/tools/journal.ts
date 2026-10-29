import { z } from 'zod';
import { api } from '../api.ts';
import { addDays, dayLabel, today } from '../dates.ts';
import { idTag, oneLine, plural } from '../format.ts';
import { changeNow, createOrQueue } from '../offline.ts';
import type { DefineTool } from '../server.ts';
import { extractTags, MAX_TAGS, serializeTags } from '../tags.ts';
import { parseTags, type DayNote, type JournalEntry, type JournalEntryInput } from '../types.ts';
import { nextDayLog } from '../writes.ts';
import { checkRange, dateParam, notFuture, rangeEndParam } from './params.ts';

const DEFAULT_DAYS = 90;
const MAX_RANGE_DAYS = 3660;
const DEFAULT_LIMIT = 20;
const PREVIEW_CHARS = 300;

type Row =
  | { kind: 'daily'; date: string; note: DayNote }
  | { kind: 'entry'; date: string; entry: JournalEntry };

function matches(query: string, ...texts: (string | null)[]): boolean {
  const q = query.toLowerCase();
  return texts.some((t) => t !== null && t.toLowerCase().includes(q));
}

// Indented under its row, so a multi-line body stays visibly part of it.
function bodyText(body: string, full: boolean): string {
  if (full) return body.trim().replace(/\n/g, '\n  ');
  const preview = oneLine(body, PREVIEW_CHARS);
  return preview.endsWith('…') ? `${preview} (${body.length} chars)` : preview;
}

function rowText(row: Row, full: boolean): string {
  if (row.kind === 'daily') {
    const rating = row.note.rating ? ` · rating ${row.note.rating}/5` : '';
    return `- ${dayLabel(row.date)} · Day log${rating}\n  ${bodyText(row.note.body, full)}`;
  }
  const { entry } = row;
  const title = entry.title ? ` · "${entry.title}"` : '';
  const tags = parseTags(entry.tags);
  const tagText = tags.length > 0 ? ` · #${tags.join(' #')}` : '';
  return `- ${dayLabel(row.date)} · Entry${title}${tagText} ${idTag(entry.id)}\n  ${bodyText(entry.body, full)}`;
}

export function registerJournalTools(defineTool: DefineTool): void {
  defineTool(
    'search_journal',
    {
      description:
        "Search the journal: day logs (the one-per-day \"how did the day go\" box, with an optional 1–5 rating) and long-form entries (titled, tagged, several per day allowed), merged newest first; within a day the day log comes first. Defaults to the last 90 days. Bodies are cut to a preview unless full is true. Everything returned becomes part of this conversation, so ask for long ranges with full text only when needed.",
      input: z.object({
        from: dateParam('First day included; pass with "to"').optional(),
        to: rangeEndParam().optional(),
        tag: z
          .string()
          .min(1)
          .optional()
          .describe('Only long-form entries carrying this tag (case-insensitive, without #). Day logs have no tags, so they are left out.'),
        query: z.string().min(1).optional().describe('Case-insensitive text to find in titles and bodies.'),
        limit: z.number().int().min(1).max(200).optional().describe(`Most rows to return, newest first. Default ${DEFAULT_LIMIT}.`),
        full: z.boolean().optional().describe('true returns whole bodies instead of previews. Default false.'),
      }),
      readOnly: true,
    },
    async ({ from, to, tag, query, limit = DEFAULT_LIMIT, full = false }) => {
      if ((from === undefined) !== (to === undefined)) throw new Error('Pass both "from" and "to", or neither.');
      const end = to ?? addDays(today(), 1);
      const start = from ?? addDays(end, -DEFAULT_DAYS);
      checkRange(start, end, MAX_RANGE_DAYS);

      const wantTag = tag?.replace(/^#/, '').toLowerCase();
      const [dayNotes, entries] = await Promise.all([
        wantTag ? Promise.resolve([]) : api.listDayNotes(start, end),
        api.listJournalEntries(start, end),
      ]);

      const rows: Row[] = [
        ...dayNotes
          .filter((n) => !query || matches(query, n.body))
          .map((note): Row => ({ kind: 'daily', date: note.entryDate, note })),
        ...entries
          .filter((e) => !wantTag || parseTags(e.tags).some((t) => t.toLowerCase() === wantTag))
          .filter((e) => !query || matches(query, e.title, e.body))
          .map((entry): Row => ({ kind: 'entry', date: entry.entryDate, entry })),
      ];
      // Newest day first; within a day the day log, then entries newest first (the API's order).
      rows.sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        if (a.kind !== b.kind) return a.kind === 'daily' ? -1 : 1;
        return 0;
      });

      const filters = [tag && `tag #${tag.replace(/^#/, '')}`, query && `"${query}"`].filter(Boolean).join(', ');
      const scope = `from ${start} to ${end} (exclusive)${filters ? `, matching ${filters}` : ''}`;
      if (rows.length === 0) return `Nothing in the journal ${scope}.`;
      const shown = rows.slice(0, limit);
      const more = rows.length > shown.length ? ` (showing the newest ${shown.length})` : '';
      return [`${plural(rows.length, 'row')} ${scope}${more}:`, ...shown.map((r) => rowText(r, full))].join('\n');
    },
  );

  defineTool(
    'write_journal_entry',
    {
      description:
        'Save a long-form journal entry (several per day are fine; for the one-per-day day log use write_day_log). ' +
        `#hashtags in the body become tags and are removed from the text; they are merged with tags, at most ${MAX_TAGS} in all. ` +
        'If the server is unreachable the entry is queued on this PC and sent later: a "Queued" answer means it is NOT saved yet.',
      input: z.object({
        body: z.string().min(1).describe('The entry text. Line breaks are kept.'),
        title: z.string().optional().describe('Optional title.'),
        tags: z.array(z.string()).optional().describe('Tags without #, e.g. ["work", "health"].'),
        date: dateParam('The day the entry is about; defaults to today').optional(),
      }),
      readOnly: false,
    },
    async ({ body, title, tags = [], date = today() }) => {
      const extracted = extractTags(body);
      if (!extracted.body) throw new Error('The entry has no text besides its hashtags.');
      const input: JournalEntryInput = {
        body: extracted.body,
        tags: serializeTags([...tags.map((t) => t.replace(/^#/, '')), ...extracted.tags]),
        // Sent explicitly, so a queued entry keeps its day instead of taking the day it is finally sent.
        entryDate: date,
        source: 'text',
      };
      if (title?.trim()) input.title = title.trim();
      const tagText = input.tags ? ` · tags: ${input.tags}` : '';
      const summary = `journal entry${input.title ? ` "${input.title}"` : ''} for ${dayLabel(date)}${tagText}`;
      return createOrQueue('journal', input, summary, (entry: JournalEntry) => `Saved ${summary} ${idTag(entry.id)}`);
    },
  );

  defineTool(
    'write_day_log',
    {
      description:
        'Write the day log: the one-per-day "how did the day go" box with an optional 1–5 rating. ' +
        'mode "append" (default) adds the text after what is already there, with a blank line between; "replace" overwrites it, and replacing with an empty body clears the day log. ' +
        'A rating left out keeps the existing rating. Never queued: if the server is unreachable nothing changes.',
      input: z.object({
        body: z.string().describe('Text to add (append) or the whole new text (replace). May be empty to change only the rating, or with replace to clear the log.'),
        date: dateParam('The day; defaults to today. Not a future day').optional(),
        rating: z.number().int().min(1).max(5).optional().describe('How the day went, 1–5.'),
        mode: z.enum(['append', 'replace']).optional().describe('append (default) or replace.'),
      }),
      readOnly: false,
    },
    ({ body, date = today(), rating, mode = 'append' }) => {
      notFuture(date, 'a day log');
      return changeNow(async () => {
        const existing = await api.getDayNote(date);
        const next = nextDayLog(existing, body, rating, mode);
        if (!next.body.trim()) {
          if (mode === 'append') throw new Error('Nothing to write: give some text, or a rating for a day that already has a log.');
          if (!existing) return `There is no day log for ${dayLabel(date)}, so there was nothing to clear.`;
          await api.saveDayNote(date, { body: '', rating: null });
          return `Cleared the day log for ${dayLabel(date)}.`;
        }
        const saved = await api.saveDayNote(date, next);
        const ratingText = saved.rating ? ` (rating ${saved.rating}/5)` : '';
        return `Saved the day log for ${dayLabel(date)}${ratingText}:\n${saved.body}`;
      });
    },
  );
}
