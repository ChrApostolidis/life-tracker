// Speech-to-text in the browser, ported from the web app's
// use-speech-recognition.ts. No audio is recorded or stored, only the text.
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const BLOCKED = new Set(['not-allowed', 'service-not-allowed']);

// No exclamation points, same as the web app's copy.
function describeSpeechError(code) {
  if (BLOCKED.has(code)) return 'Microphone not allowed yet. Allow it once on the options page.';
  if (code === 'audio-capture') return 'No microphone was found.';
  if (code === 'no-speech') return 'No speech was detected.';
  if (code === 'network') return 'The speech service could not be reached.';
  return `Voice capture failed (${code}).`;
}

// onChange(finalText, interimText) while listening, onEnd(finalText) once
// stopped. stop() lets the last words flush before onEnd fires; saving before
// then would lose the tail, which is why screens block saving mid-recording.
function createRecognizer({ onChange, onError, onEnd }) {
  let recognition = null;
  let finalText = '';

  return {
    get listening() {
      return recognition !== null;
    },

    start(lang) {
      if (!Recognition || recognition) return;
      finalText = '';
      recognition = new Recognition();
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const text = e.results[i][0].transcript;
          if (e.results[i].isFinal) {
            const trimmed = text.trim();
            if (trimmed) finalText = finalText ? `${finalText} ${trimmed}` : trimmed;
          } else {
            interim += text;
          }
        }
        onChange(finalText, interim);
      };
      // 'aborted' fires on our own cleanup and is not a user-facing failure.
      recognition.onerror = (e) => {
        if (e.error !== 'aborted') onError(describeSpeechError(e.error), BLOCKED.has(e.error));
      };
      recognition.onend = () => {
        recognition = null;
        onEnd(finalText);
      };
      recognition.start();
    },

    stop() {
      recognition?.stop();
    },
  };
}

// Dictation appends to what is already written. A trailing space or line break
// the user typed is kept, so dictating after pressing Enter starts a new line.
function appendText(base, addition) {
  if (!addition) return base;
  if (!base.trim()) return addition;
  return /\s$/.test(base) ? base + addition : `${base} ${addition}`;
}

const langLabel = (lang) => (lang === 'el-GR' ? 'EL' : 'EN');

// Shows the mic and EL/EN buttons and keeps every language chip on the page in
// step. The choice is shared by popup and panel, like the web app's lt-voice-lang.
// Returns a getter for the current language, or null when speech is unsupported.
export async function initVoiceControls(micButtons, langButtons) {
  if (!Recognition) return null;
  const { voiceLang } = await chrome.storage.local.get('voiceLang');
  let lang = voiceLang === 'en-US' ? 'en-US' : 'el-GR';

  const relabel = () => langButtons.forEach((b) => (b.textContent = langLabel(lang)));
  for (const button of langButtons) {
    button.hidden = false;
    button.addEventListener('click', async () => {
      lang = lang === 'el-GR' ? 'en-US' : 'el-GR';
      relabel();
      await chrome.storage.local.set({ voiceLang: lang });
    });
  }
  micButtons.forEach((b) => (b.hidden = false));
  relabel();
  return () => lang;
}

// Wires a mic button to a text field. The field is read-only while listening,
// dictation appends, and everything dictated is kept as the raw transcript
// (the web app keeps it after edits too). report(message, kind, optionsLink).
export function attachDictation({ field, button, getLang, report }) {
  let before = '';
  let raw = null;
  let failed = false;

  const recognizer = createRecognizer({
    onChange(finalText, interim) {
      field.value = appendText(before, appendText(finalText, interim));
    },
    onError(message, blocked) {
      failed = true;
      report(message, 'error', blocked);
    },
    onEnd(finalText) {
      button.setAttribute('aria-pressed', 'false');
      field.readOnly = false;
      field.value = appendText(before, finalText);
      if (finalText) raw = appendText(raw ?? '', finalText);
      // onend follows onerror, so only clear "Listening", never the error.
      if (!failed) report('');
      field.dispatchEvent(new Event('input')); // lets draft savers see the change
      field.focus();
    },
  });

  button.addEventListener('click', () => {
    if (recognizer.listening) {
      recognizer.stop();
      return;
    }
    before = field.value;
    failed = false;
    field.readOnly = true;
    button.setAttribute('aria-pressed', 'true');
    report('Listening');
    recognizer.start(getLang());
  });

  return {
    get listening() {
      return recognizer.listening;
    },
    get rawTranscript() {
      return raw;
    },
    set rawTranscript(value) {
      raw = value;
    },
  };
}
