import { z } from 'zod';
import { idTag, oneLine } from '../format.ts';
import { createOrQueue } from '../offline.ts';
import type { DefineTool } from '../server.ts';
import type { Note } from '../types.ts';

export function registerNoteTools(defineTool: DefineTool): void {
  defineTool(
    'add_note',
    {
      description:
        'Save a standalone note to the notes library (a quick thought, not a task or a journal entry). ' +
        'If the server is unreachable the note is queued on this PC and sent later: a "Queued" answer means it is NOT saved yet.',
      input: z.object({ body: z.string().min(1).describe('The note text.') }),
      readOnly: false,
    },
    async ({ body }) => {
      const text = body.trim();
      if (!text) throw new Error('A note needs some text.');
      const summary = `note "${oneLine(text, 60)}"`;
      return createOrQueue('note', { body: text, source: 'text' }, summary, (note: Note) => `Saved ${summary} ${idTag(note.id)}`);
    },
  );
}
