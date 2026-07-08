import type { MoneyEntry } from './types';

// Fixed v1 category sets — mirrored by the backend whitelist.
export const EXPENSE_CATEGORIES = ['food', 'transport', 'fun', 'bills', 'other'] as const;
export const INCOME_CATEGORIES = ['salary', 'gift', 'other'] as const;

// "coffee 3.50" / "καφές 3,50" → label + integer cents. The last number token
// is the amount (labels may contain numbers: "taxi 2 people 10" → 10.00); the
// rest is the label. Returns null when either half is missing.
export function parseMoneyInput(
  text: string,
): { label: string; amountCents: number } | null {
  const matches = [...text.matchAll(/\d+(?:[.,]\d{1,2})?/g)];
  const last = matches[matches.length - 1];
  if (!last) return null;
  const amountCents = Math.round(parseFloat(last[0].replace(',', '.')) * 100);
  const label = (text.slice(0, last.index) + text.slice(last.index + last[0].length)).trim();
  if (amountCents <= 0 || !label) return null;
  return { label, amountCents };
}

// 1234 → "€12.34" (negative balances keep the minus in front of the €).
export function formatEuros(cents: number): string {
  const abs = Math.abs(cents);
  const euros = `€${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return cents < 0 ? `-${euros}` : euros;
}

export function sumCents(entries: MoneyEntry[]): number {
  return entries.reduce((sum, e) => sum + e.amountCents, 0);
}
