// Wires the side panel together: tabs, the date header, refreshing, and the
// waiting-to-send line. Each tab's own logic lives in panel-tasks / panel-journal.
import { showQueue } from './lib/capture.js';
import { initVoiceControls } from './lib/voice.js';
import { initJournal, load as loadJournal } from './panel-journal.js';
import { initTasks, isEditing, load as loadTasks } from './panel-tasks.js';

const REFRESH_MS = 5 * 60 * 1000;
const $ = (id) => document.getElementById(id);
const tabs = [...document.querySelectorAll('[role="tab"]')];
const queueChanged = () => showQueue($('queue'));

function showTab(name) {
  for (const tab of tabs) {
    const active = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(active));
    $(tab.getAttribute('aria-controls')).hidden = !active;
  }
  chrome.storage.local.set({ panelTab: name });
}

function renderDate() {
  $('date').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// A refresh never interrupts an edit in progress; the next one catches up.
function refresh() {
  renderDate();
  if (!isEditing()) loadTasks();
  loadJournal();
  queueChanged();
}

async function init() {
  const getLang = await initVoiceControls(
    [$('add-mic'), $('journal-mic')],
    [$('add-lang'), $('journal-lang')],
  );
  initTasks({ getLang, queueChanged });
  await initJournal({ getLang, queueChanged });

  for (const tab of tabs) tab.addEventListener('click', () => showTab(tab.dataset.tab));
  $('refresh').addEventListener('click', refresh);
  // The panel stays open all day, so it refreshes whenever it comes back into view.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') refresh();
  }, REFRESH_MS);

  const { panelTab } = await chrome.storage.local.get('panelTab');
  showTab(panelTab === 'journal' ? 'journal' : 'today');
  refresh();
}

init();
