// Same rules as serializeTags in the web app's types.ts and the Telegram
// /journal command, so every surface stores tags identically.
const MAX_TAGS = 5;
// \p{L} keeps Greek tags working.
const TAG_RE = /#[\p{L}\p{N}_-]+/gu;

function serializeTags(tags) {
  const seen = new Set();
  const kept = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(tag);
    if (kept.length === MAX_TAGS) break;
  }
  return kept.length > 0 ? kept.join(', ') : null;
}

// Pulls #hashtags out of a body. Line breaks are kept: this is long-form text.
export function extractTags(text) {
  const tags = (text.match(TAG_RE) || []).map((t) => t.slice(1));
  const body = text
    .replace(TAG_RE, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .trim();
  return { body, tags: serializeTags(tags) };
}
