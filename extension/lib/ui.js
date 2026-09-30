// Small DOM helpers shared by the popup and the side panel.

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  // textContent, never innerHTML: titles come from typing, voice and Telegram.
  if (text !== undefined) node.textContent = text;
  return node;
}

export function setStatus(node, message, kind = '', optionsLink = false) {
  node.className = `status ${kind}`;
  node.textContent = message;
  if (!optionsLink) return;
  const link = el('a', '', ' Open options');
  link.href = '#';
  link.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  node.append(link);
}

// A row of radio-style chips (buttons carrying data-choice). Calls onChange with
// the chosen value and exposes it, so callers never read aria state themselves.
export function wireChoiceChips(container, onChange = () => {}) {
  const chips = [...container.querySelectorAll('[data-choice]')];
  let value = chips.find((c) => c.getAttribute('aria-checked') === 'true')?.dataset.choice;

  function select(next) {
    value = next;
    for (const chip of chips) chip.setAttribute('aria-checked', String(chip.dataset.choice === next));
    onChange(next);
  }
  for (const chip of chips) chip.addEventListener('click', () => select(chip.dataset.choice));

  return {
    get value() {
      return value;
    },
    select,
  };
}
