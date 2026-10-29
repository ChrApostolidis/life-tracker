import { z } from 'zod';
import { api } from '../api.ts';
import { dayLabel, today } from '../dates.ts';
import { euros, idTag, oneLine, plural } from '../format.ts';
import { createOrQueue } from '../offline.ts';
import type { DefineTool } from '../server.ts';
import type { MoneyEntry, MoneyEntryInput, MoneyEntryType } from '../types.ts';
import { checkCategory, MONEY_CATEGORIES, parseEuros } from '../writes.ts';
import { checkRange, dateParam, rangeEndParam } from './params.ts';

const MAX_RANGE_DAYS = 3660;

function byCategory(entries: MoneyEntry[], type: MoneyEntryType): string {
  const sums = new Map<string, number>();
  for (const e of entries) {
    if (e.type !== type) continue;
    const key = e.category ?? 'uncategorised';
    sums.set(key, (sums.get(key) ?? 0) + e.amountCents);
  }
  return [...sums]
    .sort((a, b) => b[1] - a[1])
    .map(([category, cents]) => `${category} ${euros(cents)}`)
    .join(' · ');
}

export function registerMoneyTools(defineTool: DefineTool): void {
  defineTool(
    'get_money',
    {
      description:
        'Money log entries (expenses and income, in euros) in a date range, oldest first, then totals per type, the net, and totals per category.',
      input: z.object({
        from: dateParam('First day included'),
        to: rangeEndParam(),
      }),
      readOnly: true,
    },
    async ({ from, to }) => {
      checkRange(from, to, MAX_RANGE_DAYS);
      const entries = await api.listMoney(from, to);
      if (entries.length === 0) return `No money entries from ${from} to ${to} (exclusive).`;

      const sum = (type: MoneyEntryType) =>
        entries.filter((e) => e.type === type).reduce((total, e) => total + e.amountCents, 0);
      const spent = sum('expense');
      const earned = sum('income');

      const lines = [`${plural(entries.length, 'entry', 'entries')} from ${from} to ${to} (exclusive):`];
      for (const e of entries) {
        const category = e.category ? ` (${e.category})` : '';
        lines.push(`- ${e.occurredOn} · ${e.type} ${euros(e.amountCents)} · ${oneLine(e.label)}${category} ${idTag(e.id)}`);
      }
      lines.push('', `Spent ${euros(spent)} · earned ${euros(earned)} · net ${euros(earned - spent)}`);
      if (spent > 0) lines.push(`Spent by category: ${byCategory(entries, 'expense')}`);
      if (earned > 0) lines.push(`Earned by category: ${byCategory(entries, 'income')}`);
      return lines.join('\n');
    },
  );

  defineTool(
    'log_money',
    {
      description:
        'Log an expense or income in euros. ' +
        `Categories: expense ${MONEY_CATEGORIES.expense.join('/')}, income ${MONEY_CATEGORIES.income.join('/')}; optional. ` +
        'If the server is unreachable the entry is queued on this PC and sent later: a "Queued" answer means it is NOT saved yet.',
      input: z.object({
        type: z.enum(['expense', 'income']).describe('expense or income.'),
        amount: z
          .union([z.number().positive(), z.string().min(1)])
          .describe('Amount in euros, positive, at most two decimals: 12.5, "12.50" or "12,50".'),
        label: z.string().min(1).describe('What it was, e.g. "Lunch" or "Train ticket".'),
        category: z.string().optional().describe('One of the categories for its type (see the description).'),
        date: dateParam('The day it happened; defaults to today').optional(),
      }),
      readOnly: false,
    },
    async ({ type, amount, label, category, date = today() }) => {
      const input: MoneyEntryInput = {
        type,
        amountCents: parseEuros(amount),
        label: label.trim(),
        category: checkCategory(type, category),
        occurredOn: date,
      };
      if (!input.label) throw new Error('Give a label.');
      const categoryText = input.category ? ` (${input.category})` : '';
      const summary = `${type} ${euros(input.amountCents)} · ${input.label}${categoryText} on ${dayLabel(date)}`;
      return createOrQueue('money', input, summary, (entry: MoneyEntry) => `Logged ${summary} ${idTag(entry.id)}`);
    },
  );
}
