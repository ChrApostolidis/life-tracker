// Task capture shared by the popup and the side panel's add box.
import { dayForChoice } from './dates.js';
import { send } from './messages.js';

const LABELS = { inbox: 'the Inbox', today: 'Today', tomorrow: 'Tomorrow' };

export function captureTask(title, choice, rawTranscript) {
  return send('createTask', {
    title,
    // A dated capture with no time is stored at local midnight in the web app too.
    scheduledAt: dayForChoice(choice)?.toISOString() ?? null,
    source: rawTranscript ? 'voice' : 'text',
    rawTranscript,
  });
}

// [message, statusKind] for a successful capture, queued or not.
export function savedMessage(result, choice) {
  return result.queued
    ? ['Saved offline. It will send when the server is back', 'warning']
    : [`Added to ${LABELS[choice]}`, 'ok'];
}

export async function showQueue(node) {
  const { ok, count, error } = await send('queueStatus');
  node.hidden = !ok || count === 0;
  if (ok && count > 0) node.textContent = `${count} waiting to send${error ? `: ${error}` : ''}`;
}
