import { z } from 'zod';
import { api } from '../api.ts';
import { dateOf, dayLabel, today } from '../dates.ts';
import { idTag, oneLine, plural } from '../format.ts';
import { changeNow, createOrQueue, lookupForCreate } from '../offline.ts';
import { resolveByName } from '../resolve.ts';
import type { DefineTool } from '../server.ts';
import {
  parseTags,
  type Project,
  type ProjectItem,
  type ProjectItemInput,
  type ProjectStage,
  type ProjectSummary,
  type ProjectUpdate,
} from '../types.ts';
import { dateParam } from './params.ts';

const STAGES: ProjectStage[] = ['todo', 'doing', 'done', 'blocked'];
const LATEST_UPDATES = 5;

function countsText(summary: ProjectSummary): string {
  return STAGES.map((s) => `${s} ${summary.counts[s]}`).join(' · ');
}

// The backend clamps index to the target stage's size, so the largest Java int
// lands the item last without fetching the board first.
const END_OF_STAGE = 2_147_483_647;

function projectParam() {
  return z.string().min(1).describe('Project name (case-insensitive; a unique prefix is enough) or its id.');
}

async function findProject(query: string): Promise<Project> {
  const summaries = await api.listProjects();
  return resolveByName(
    summaries.map((s) => s.project),
    query,
    'project',
  );
}

function itemLine(item: ProjectItem): string {
  const parts = [oneLine(item.title)];
  if (item.priority !== 'normal') parts.push(`(${item.priority})`);
  if (item.dueOn) parts.push(`· due ${item.dueOn}`);
  return `- ${parts.join(' ')} ${idTag(item.id)}`;
}

export function registerProjectTools(defineTool: DefineTool): void {
  defineTool(
    'list_projects',
    {
      description:
        'Side projects with their status (idea, ongoing, finished), pitch, tags, board counts per stage (todo, doing, done, blocked) and last activity, most recently active first.',
      input: z.object({
        status: z.enum(['idea', 'ongoing', 'finished']).optional().describe('Only projects with this status. Default: all.'),
      }),
      readOnly: true,
    },
    async ({ status }) => {
      const summaries = (await api.listProjects()).filter((s) => !status || s.project.status === status);
      if (summaries.length === 0) return status ? `No ${status} projects.` : 'No projects yet.';
      const lines = [`${plural(summaries.length, 'project')}${status ? ` (${status})` : ''}:`];
      for (const s of summaries) {
        const { project } = s;
        const tags = parseTags(project.tags);
        const tagText = tags.length > 0 ? ` · tags: ${tags.join(', ')}` : '';
        lines.push(
          `- ${project.name} (${project.status}) · ${countsText(s)}${tagText} · last activity ${dateOf(s.lastActivityAt)} ${idTag(project.id)}`,
        );
        if (project.pitch) lines.push(`  ${oneLine(project.pitch)}`);
      }
      return lines.join('\n');
    },
  );

  defineTool(
    'get_project',
    {
      description:
        "One project in full: details, its board items grouped by stage (todo, doing, done, blocked) in board order with priority and due date, and the latest 5 progress updates. Board items are separate from tasks and never appear in get_day.",
      input: z.object({ project: projectParam() }),
      readOnly: true,
    },
    async ({ project: query }) => {
      const found = await findProject(query);
      const [project, items, updates] = await Promise.all([
        api.getProject(found.id),
        api.listProjectItems(found.id),
        api.listProjectUpdates(found.id),
      ]);

      const lines = [`${project.name} (${project.status}) ${idTag(project.id)}`];
      if (project.pitch) lines.push(`Pitch: ${project.pitch}`);
      const tags = parseTags(project.tags);
      if (tags.length > 0) lines.push(`Tags: ${tags.join(', ')}`);
      const stack = parseTags(project.techStack);
      if (stack.length > 0) lines.push(`Tech stack: ${stack.join(', ')}`);
      if (project.repoUrl) lines.push(`Repo: ${project.repoUrl}`);
      if (project.liveUrl) lines.push(`Live: ${project.liveUrl}`);
      if (project.startedOn) lines.push(`Started ${project.startedOn}${project.finishedOn ? `, finished ${project.finishedOn}` : ''}`);
      if (project.description) lines.push('', 'Description:', project.description);

      lines.push('', 'Board:');
      for (const stage of STAGES) {
        const inStage = items.filter((i) => i.stage === stage);
        lines.push(`${stage} (${inStage.length}):`, ...inStage.map(itemLine));
      }

      const latest = updates.slice(0, LATEST_UPDATES);
      lines.push('', latest.length > 0 ? `Latest updates (${latest.length} of ${updates.length}):` : 'Updates: none');
      for (const u of latest) lines.push(`- ${u.entryDate} · ${oneLine(u.body, 400)} ${idTag(u.id)}`);
      return lines.join('\n');
    },
  );

  defineTool(
    'add_project_item',
    {
      description:
        "Add a card to a project's board, at the end of its stage (todo unless given). Board items are separate from tasks and never reach the day view. " +
        'If the server is unreachable the item is queued on this PC and sent later: a "Queued" answer means it is NOT saved yet. ' +
        'The project name is looked up first, so with the server down this fails instead of queueing.',
      input: z.object({
        project: projectParam(),
        title: z.string().min(1).max(200).describe('The card title.'),
        description: z.string().optional().describe('Longer text for the card.'),
        stage: z.enum(['todo', 'doing', 'done', 'blocked']).optional().describe('Column; default todo.'),
        priority: z.enum(['low', 'normal', 'urgent']).optional().describe('Default normal.'),
        due: dateParam('Due day').optional(),
      }),
      readOnly: false,
    },
    async ({ project: query, title, description, stage, priority, due }) => {
      const project = await lookupForCreate(() => findProject(query));
      const item: ProjectItemInput = { title: title.trim() };
      if (description?.trim()) item.description = description;
      if (stage) item.stage = stage;
      if (priority) item.priority = priority;
      if (due) item.dueOn = due;
      const summary = `"${item.title}" on ${project.name}'s board (${stage ?? 'todo'})`;
      return createOrQueue(
        'projectItem',
        { projectId: project.id, item },
        summary,
        (created: ProjectItem) => `Added ${summary} ${idTag(created.id)}`,
      );
    },
  );

  defineTool(
    'move_project_item',
    {
      description:
        'Move a board card to another stage (todo, doing, done, blocked), placing it at the end of that column. Moving into done marks it completed. Never queued: if the server is unreachable nothing changes.',
      input: z.object({
        id: z.string().min(1).describe('The board item id, from get_project.'),
        stage: z.enum(['todo', 'doing', 'done', 'blocked']).describe('The target column.'),
      }),
      readOnly: false,
    },
    ({ id, stage }) =>
      changeNow(async () => {
        const board = await api.moveProjectItem(id, stage, END_OF_STAGE);
        const item = board.find((i) => i.id === id);
        if (!item) throw new Error(`The move went through, but item ${id} was not on the board it returned.`);
        const inStage = board.filter((i) => i.stage === item.stage).length;
        return `Moved "${item.title}" to ${item.stage} (last of ${inStage}) ${idTag(item.id)}`;
      }),
  );

  defineTool(
    'add_project_update',
    {
      description:
        "Add a dated progress note to a project's Updates. " +
        'If the server is unreachable the update is queued on this PC and sent later: a "Queued" answer means it is NOT saved yet. ' +
        'The project name is looked up first, so with the server down this fails instead of queueing.',
      input: z.object({
        project: projectParam(),
        body: z.string().min(1).describe('What happened.'),
        date: dateParam('The day it is about; defaults to today').optional(),
      }),
      readOnly: false,
    },
    async ({ project: query, body, date = today() }) => {
      const text = body.trim();
      if (!text) throw new Error('An update needs some text.');
      const project = await lookupForCreate(() => findProject(query));
      const summary = `update on ${project.name} for ${dayLabel(date)}: "${oneLine(text, 60)}"`;
      return createOrQueue(
        'projectUpdate',
        // entryDate is sent explicitly so a queued update keeps its day.
        { projectId: project.id, update: { body: text, entryDate: date, source: 'text' } },
        summary,
        (update: ProjectUpdate) => `Added ${summary} ${idTag(update.id)}`,
      );
    },
  );
}
