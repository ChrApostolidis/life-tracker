'use client';

import { useEffect, useState } from 'react';
import { api, describeError } from './api';
import { addDays, toDateInput } from './date';
import { computeGameState, type GameState } from './game';
import { taskKey } from './helpers';
import type { Task } from './types';

type State = { loading: boolean; error: string | null; game: GameState | null };

// 
const HISTORY_START = new Date(2020, 0, 1);


// it fetches all the data needed to compute the game state, including tasks, notes, and money entries. 
// It returns a state object that indicates whether the data is still loading, if there was an error, and the computed game state if successful.
export function useGameData(): State {
  const [state, setState] = useState<State>({ loading: true, error: null, game: null });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const now = new Date();
        const from = HISTORY_START.toISOString();
        const to = toDateInput(addDays(now, 1));
        const [scheduled, inbox, notes, money, habitChecks] = await Promise.all([
          api.listRange(from, addDays(now, 1).toISOString()),
          api.listInbox(),
          api.listNotes(),
          api.listMoney(toDateInput(HISTORY_START), to),
          api.listHabitChecks(toDateInput(HISTORY_START), to),
        ]);

        const byKey = new Map<string, Task>();
        [...scheduled, ...inbox].forEach((t) => byKey.set(taskKey(t), t));
        const tasks = [...byKey.values()];
        const inboxCount = inbox.filter((t) => !t.deletedAt).length;

        if (cancelled) return;
        setState({
          loading: false,
          error: null,
          game: computeGameState({ tasks, notes, money, habitChecks, inboxCount, now }),
        });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: describeError(e, 'Could not load stats'), game: null });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
