'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPen, faPiggyBank, faTrash, faWallet } from '@fortawesome/free-solid-svg-icons';
import PeriodNav from '@/app/components/PeriodNav';
import { useMoney } from '@/lib/money-context';
import { api, describeError } from '@/lib/api';
import {
  addDays,
  formatDate,
  startOfDay,
  startOfMonth,
  startOfWeek,
  toDateInput,
} from '@/lib/date';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  formatEuros,
  parseMoneyInput,
  sumCents,
} from '@/lib/money';
import type {
  MoneyBalance,
  MoneyEntry,
  MoneyEntryPatch,
  MoneyEntryType,
} from '@/lib/types';
import styles from './money.module.css';

export default function MoneyPage() {
  const { entries, loading, error, setRange, addEntry, updateEntry, deleteEntry } = useMoney();
  const [day, setDay] = useState<Date>(() => startOfDay(new Date()));
  const [balance, setBalance] = useState<MoneyBalance | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const dayStr = toDateInput(day);

  // One window covers both the viewed day and every stats bucket: the current
  // year, extended to the last 30 days in early January and to the viewed day
  // when it falls outside.
  useEffect(() => {
    const today = startOfDay(new Date());
    const yearStart = new Date(today.getFullYear(), 0, 1);
    const thirtyAgo = addDays(today, -29);
    let from = thirtyAgo < yearStart ? thirtyAgo : yearStart;
    if (day < from) from = day;
    const dayAfter = addDays(day, 1);
    const tomorrow = addDays(today, 1);
    setRange(toDateInput(from), toDateInput(dayAfter > tomorrow ? dayAfter : tomorrow));
  }, [day, setRange]);

  // The piggy bank is all-time, so it comes from the backend; refetch when
  // entries change so it tracks the capture row on the same page.
  useEffect(() => {
    api
      .moneyBalance()
      .then(setBalance)
      .catch((e: unknown) => setBalanceError(describeError(e, 'Could not load balance')));
  }, [entries]);

  const dayEntries = entries.filter((m) => m.occurredOn === dayStr);
  const spent = sumCents(dayEntries.filter((m) => m.type === 'expense'));
  const earned = sumCents(dayEntries.filter((m) => m.type === 'income'));

  // ── Capture row (doubles as the inline editor) ──
  const [text, setText] = useState('');
  const [entryType, setEntryType] = useState<MoneyEntryType>('expense');
  const [category, setCategory] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const categories = entryType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  function resetCapture() {
    setText('');
    setCategory(null);
    setEditingId(null);
    setShowHint(false);
  }

  function switchType(type: MoneyEntryType) {
    setEntryType(type);
    setCategory(null); // category sets differ per type
  }

  function startEdit(entry: MoneyEntry) {
    setEditingId(entry.id);
    setEntryType(entry.type);
    setText(`${entry.label} ${(entry.amountCents / 100).toFixed(2)}`);
    setCategory(entry.category);
    setShowHint(false);
    inputRef.current?.focus();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Amount-only input borrows the selected pill as its label ("salary" + "1200").
    const parsed =
      parseMoneyInput(text) ?? (category ? parseMoneyInput(`${category} ${text}`) : null);
    if (!parsed) {
      setShowHint(true);
      return;
    }
    if (editingId) {
      // PATCH: absent = unchanged, so only send the category when one is picked.
      const patch: MoneyEntryPatch = { ...parsed };
      if (category) patch.category = category;
      void updateEntry(editingId, patch);
    } else {
      void addEntry({ type: entryType, ...parsed, category, occurredOn: dayStr });
    }
    resetCapture();
  }

  // ── Stats (always relative to the real today, not the viewed day) ──
  const today = startOfDay(new Date());
  const todayStr = toDateInput(today);
  const weekStartStr = toDateInput(startOfWeek(today));
  const monthStartStr = toDateInput(startOfMonth(today));
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const yearStartStr = toDateInput(yearStart);

  // 'YYYY-MM-DD' compares lexically = chronologically.
  const expenses = entries.filter((m) => m.type === 'expense');
  const spentSince = (fromStr: string) =>
    sumCents(expenses.filter((m) => m.occurredOn >= fromStr));

  const todaySpent = sumCents(expenses.filter((m) => m.occurredOn === todayStr));
  const weekSpent = spentSince(weekStartStr);
  const monthSpent = spentSince(monthStartStr);
  const yearSpent = spentSince(yearStartStr);
  const monthEarned = sumCents(
    entries.filter((m) => m.type === 'income' && m.occurredOn >= monthStartStr),
  );

  const dayOfMonth = today.getDate();
  const dayOfYear = Math.round((today.getTime() - yearStart.getTime()) / 86_400_000) + 1;

  const tiles = [
    { label: 'Today', value: todaySpent, sub: null },
    { label: 'This week', value: weekSpent, sub: null },
    {
      label: 'This month',
      value: monthSpent,
      sub: `${formatEuros(Math.round(monthSpent / dayOfMonth))} / day`,
    },
    {
      label: 'This year',
      value: yearSpent,
      sub: `${formatEuros(Math.round(yearSpent / dayOfYear))} / day`,
    },
  ];

  // Category breakdown — this month's expenses, largest first.
  const catTotals = new Map<string, number>();
  expenses
    .filter((m) => m.occurredOn >= monthStartStr)
    .forEach((m) => {
      const key = m.category ?? 'uncategorized';
      catTotals.set(key, (catTotals.get(key) ?? 0) + m.amountCents);
    });
  const catRows = [...catTotals.entries()].sort((a, b) => b[1] - a[1]);
  const catMax = catRows[0]?.[1] ?? 0;

  // Last 30 days of spend, oldest → newest.
  const days = Array.from({ length: 30 }, (_, i) => {
    const key = toDateInput(addDays(today, i - 29));
    return { key, total: sumCents(expenses.filter((m) => m.occurredOn === key)) };
  });
  const dayMax = Math.max(...days.map((d) => d.total), 1);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>Money</div>
        <div className={styles.headerRow}>
          <h1 className={styles.title}>{formatDate(day)}</h1>
          <PeriodNav
            onPrev={() => setDay(addDays(day, -1))}
            onToday={() => setDay(startOfDay(new Date()))}
            onNext={() => setDay(addDays(day, 1))}
          />
        </div>
        <div className={styles.meta}>
          <span className={styles.spent}>{formatEuros(spent)} spent</span>
          {' · '}
          <span className={earned > 0 ? styles.earned : undefined}>
            {formatEuros(earned)} earned
          </span>
        </div>
      </header>

      <form className={styles.capture} onSubmit={handleSubmit}>
        <div className={styles.captureTop}>
          <input
            ref={inputRef}
            className={styles.captureInput}
            placeholder={entryType === 'income' ? 'salary 1200' : 'coffee 3.50'}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setShowHint(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') resetCapture();
            }}
          />
          <button type="submit" className={styles.saveBtn}>
            {editingId ? 'Update' : 'Add'}
          </button>
        </div>
        <div className={styles.captureBottom}>
          <div className={styles.typeToggle} role="radiogroup" aria-label="Entry type">
            <button
              type="button"
              role="radio"
              aria-checked={entryType === 'expense'}
              className={[styles.typeOption, entryType === 'expense' ? styles.typeOptionActive : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => switchType('expense')}
              disabled={editingId !== null}
            >
              Spent
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={entryType === 'income'}
              className={[styles.typeOption, entryType === 'income' ? styles.typeOptionActive : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => switchType('income')}
              disabled={editingId !== null}
            >
              Earned
            </button>
          </div>
          <div className={styles.categoryPills}>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={[styles.pill, category === cat ? styles.pillActive : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setCategory(category === cat ? null : cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
        {showHint && (
          <div className={styles.hint}>
            Add an amount, e.g. “coffee 3.50” — or pick a category and type just the amount.
          </div>
        )}
        {editingId && (
          <div className={styles.hint}>Editing an entry — esc to cancel.</div>
        )}
      </form>

      {(error || balanceError) && <div className={styles.message}>{error ?? balanceError}</div>}
      {!error && loading && dayEntries.length === 0 && (
        <div className={styles.message}>Loading…</div>
      )}

      {!loading && !error && dayEntries.length === 0 ? (
        <div className={styles.empty}>
          <FontAwesomeIcon icon={faWallet} className={styles.emptyIcon} />
          <p>Nothing logged for this day.</p>
        </div>
      ) : (
        dayEntries.length > 0 && (
          <div className={styles.card}>
            {dayEntries.map((entry) => (
              <div key={entry.id} className={styles.row}>
                <span className={styles.rowLabel}>{entry.label}</span>
                {entry.category && <span className={styles.categoryTag}>{entry.category}</span>}
                <div className={styles.rowMeta}>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.editBtn}
                      onClick={() => startEdit(entry)}
                      aria-label="Edit entry"
                    >
                      <FontAwesomeIcon icon={faPen} />
                    </button>
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      onClick={() => deleteEntry(entry.id)}
                      aria-label="Delete entry"
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </div>
                  <span
                    className={[styles.amount, entry.type === 'income' ? styles.amountIncome : '']
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {entry.type === 'income' ? '+' : ''}
                    {formatEuros(entry.amountCents)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      <section className={styles.statsBlock}>
        <div className={styles.sectionLabel}>Stats</div>

        <div className={styles.hero}>
          <FontAwesomeIcon icon={faPiggyBank} className={styles.heroIcon} />
          <div className={styles.heroBody}>
            <div className={styles.heroLabel}>Piggy bank</div>
            <div className={styles.heroAmount}>
              {balance ? formatEuros(balance.earnedCents - balance.spentCents) : '—'}
            </div>
            {balance && (
              <div className={styles.heroSub}>
                {formatEuros(balance.earnedCents)} earned − {formatEuros(balance.spentCents)}{' '}
                spent, all time · {formatEuros(monthEarned - monthSpent)} net this month
              </div>
            )}
          </div>
        </div>

        <div className={styles.tiles}>
          {tiles.map((tile) => (
            <div key={tile.label} className={styles.tile}>
              <div className={styles.tileLabel}>{tile.label}</div>
              <div className={styles.tileValue}>{formatEuros(tile.value)}</div>
              {tile.sub && <div className={styles.tileSub}>{tile.sub}</div>}
            </div>
          ))}
        </div>

        <section className={styles.section}>
          <div className={styles.sectionLabel}>This month by category</div>
          {catRows.length === 0 ? (
            <div className={styles.message}>No expenses this month.</div>
          ) : (
            <div className={styles.catList}>
              {catRows.map(([cat, total]) => (
                <div key={cat} className={styles.catRow}>
                  <span className={styles.catName}>{cat}</span>
                  <div className={styles.catTrack}>
                    <div
                      className={styles.catFill}
                      style={{ width: `${(total / catMax) * 100}%` }}
                    />
                  </div>
                  <span className={styles.catAmount}>{formatEuros(total)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionLabel}>Last 30 days</div>
          <div className={styles.strip}>
            {days.map((d) => (
              <div
                key={d.key}
                className={styles.stripBar}
                title={`${d.key} · ${formatEuros(d.total)}`}
              >
                <div
                  className={[styles.stripFill, d.total === 0 ? styles.stripFillEmpty : '']
                    .filter(Boolean)
                    .join(' ')}
                  style={{ height: `${d.total > 0 ? Math.max((d.total / dayMax) * 100, 6) : 3}%` }}
                />
              </div>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
