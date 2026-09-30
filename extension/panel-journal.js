// The side panel's Journal tab: a composer for a new long-form entry, and the
// entries already written today so a save has something visible to land in.
import { formatTimeLabel } from './lib/dates.js';
import { send } from './lib/messages.js';
import { extractTags } from './lib/tags.js';
import { el, setStatus } from './lib/ui.js';
import { attachDictation } from './lib/voice.js';

const $ = (id) => document.getElementById(id);
const form = $('journal');
const titleInput = $('journal-title');
const bodyInput = $('journal-body');
const saveButton = $('journal-save');
const status = $('journal-status');
const list = $('journal-list');

let entries = null; // today's entries once loaded
const expanded = new Set();
let dictation = null;
let onQueueChange = () => {};

const report = (message, kind, optionsLink) => setStatus(status, message, kind, optionsLink);

// ── Today's entries ─────────────────────────────────────────────────────────

function renderSkeleton() {
  const card = el('div', 'entry');
  card.setAttribute('role', 'status');
  card.setAttribute('aria-label', 'Loading');
  for (const width of ['40%', '100%', '85%']) {
    const line = el('span', 'skeleton skeleton-line');
    line.style.width = width;
    card.append(line);
  }
  list.replaceChildren(card);
}

function entryCard(entry) {
  const isOpen = expanded.has(entry.id);
  const card = el('button', isOpen ? 'entry expanded' : 'entry');
  card.type = 'button';
  card.setAttribute('aria-expanded', String(isOpen));
  card.addEventListener('click', () => {
    if (isOpen) expanded.delete(entry.id);
    else expanded.add(entry.id);
    render();
  });

  const head = el('span', 'entry-head');
  if (entry.title) head.append(el('span', 'entry-title', entry.title));
  head.append(el('span', 'entry-time', formatTimeLabel(entry.createdAt)));
  card.append(head, el('span', 'entry-body', entry.body));

  const tags = entry.tags ? entry.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
  if (tags.length) {
    const row = el('span', 'entry-tags');
    for (const tag of tags) row.append(el('span', 'tag', `#${tag}`));
    card.append(row);
  }
  return card;
}

function render() {
  $('journal-meta').textContent = entries.length === 1 ? '1 entry' : entries.length ? `${entries.length} entries` : '';
  if (entries.length === 0) {
    list.replaceChildren(el('p', 'empty', 'Nothing written today yet.'));
    return;
  }
  list.replaceChildren(...entries.map(entryCard));
}

export async function load() {
  if (!entries) renderSkeleton();
  const result = await send('getJournalToday');
  if (!result.ok) {
    if (entries) return; // keep what is on screen; the Tasks tab reports refresh failures
    const message = el('p', 'status error', result.error);
    const retry = el('button', 'link-button retry', 'Retry');
    retry.type = 'button';
    retry.addEventListener('click', load);
    message.append(retry);
    list.replaceChildren(message);
    return;
  }
  entries = result.entries;
  render();
}

// ── Composer ────────────────────────────────────────────────────────────────

// The draft survives closing the panel, the way the day journal saves on unmount.
function saveDraft() {
  chrome.storage.local.set({
    journalDraft: {
      title: titleInput.value,
      body: bodyInput.value,
      rawTranscript: dictation?.rawTranscript ?? null,
    },
  });
}

async function restoreDraft() {
  const { journalDraft } = await chrome.storage.local.get('journalDraft');
  if (!journalDraft) return;
  titleInput.value = journalDraft.title ?? '';
  bodyInput.value = journalDraft.body ?? '';
  if (dictation) dictation.rawTranscript = journalDraft.rawTranscript ?? null;
}

async function submit(event) {
  event.preventDefault();
  if (dictation?.listening) return report('Stop dictating before saving', 'error');
  const { body, tags } = extractTags(bodyInput.value);
  if (!body) return report('Write something besides tags first', 'error');

  const rawTranscript = dictation?.rawTranscript ?? null;
  saveButton.disabled = true;
  report('Saving');
  // entryDate is left out: the server defaults it to today in its own timezone.
  const result = await send('createJournal', {
    title: titleInput.value.trim() || null,
    body,
    tags,
    source: rawTranscript ? 'voice' : 'text',
    rawTranscript,
  });
  saveButton.disabled = false;

  // On failure the draft is untouched, so nothing written is lost.
  if (!result.ok) return report(result.error, 'error', result.error.includes('options'));

  titleInput.value = '';
  bodyInput.value = '';
  if (dictation) dictation.rawTranscript = null;
  chrome.storage.local.remove('journalDraft');
  if (result.queued) {
    report('Saved offline. It will send when the server is back', 'warning');
    onQueueChange();
  } else {
    report('Saved. It is at the top of the list below', 'ok');
    load();
  }
}

export async function initJournal({ getLang, queueChanged }) {
  onQueueChange = queueChanged;
  if (getLang) dictation = attachDictation({ field: bodyInput, button: $('journal-mic'), getLang, report });
  await restoreDraft();

  titleInput.addEventListener('input', saveDraft);
  bodyInput.addEventListener('input', saveDraft);
  bodyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener('submit', submit);
}
