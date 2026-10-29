// Finds a project, habit or exercise from what the user called it. Never
// guesses: no match or several matches is an error naming the candidates.

export type Named = { id: string; name: string };

const MAX_LISTED = 30;

function normalize(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

function listOf(items: Named[]): string {
  const shown = items.slice(0, MAX_LISTED).map((i) => `${i.name} [id:${i.id}]`);
  const more = items.length > MAX_LISTED ? `, and ${items.length - MAX_LISTED} more` : '';
  return shown.join(', ') + more;
}

// An exact id first, then an exact name (case-insensitive), then a unique name prefix.
export function resolveByName<T extends Named>(items: T[], query: string, kind: string): T {
  const wanted = normalize(query);
  if (!wanted) throw new Error(`Give a ${kind} name or id.`);

  const byId = items.find((i) => i.id === query.trim());
  if (byId) return byId;

  const exact = items.filter((i) => normalize(i.name) === wanted);
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) {
    throw new Error(`Several ${kind}s are called "${query.trim()}": ${listOf(exact)}. Use the id.`);
  }

  const prefixed = items.filter((i) => normalize(i.name).startsWith(wanted));
  if (prefixed.length === 1) return prefixed[0]!;
  if (prefixed.length > 1) {
    throw new Error(`"${query.trim()}" matches several ${kind}s: ${listOf(prefixed)}. Use the full name or the id.`);
  }

  if (items.length === 0) throw new Error(`No ${kind} matches "${query.trim()}". There are no ${kind}s yet.`);
  throw new Error(`No ${kind} matches "${query.trim()}". The ${kind}s are: ${listOf(items)}.`);
}
