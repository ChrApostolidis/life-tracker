'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { useSpeechRecognition } from './use-speech-recognition';

export type VoiceLang = 'el-GR' | 'en-US';

// Shared with CaptureModal and the Journal so the language choice follows you.
const VOICE_LANG_KEY = 'lt-voice-lang';

// Dictation that appends to a text field instead of replacing it — the Journal's
// rule, since a long thought gets built in passes: type a bit, speak a bit.
// Speech-to-text only; no audio is recorded or stored.
export function useDictation(text: string, onText: (next: string) => void) {
  const speech = useSpeechRecognition();
  const [voiceLang, setVoiceLang] = useState<VoiceLang>('el-GR');
  // The field and the transcript as they stood when this recording began.
  const [textBefore, setTextBefore] = useState('');
  const [transcriptBefore, setTranscriptBefore] = useState<string | null>(null);
  // Everything dictated since the last clear(), saved as rawTranscript.
  const [transcript, setTranscript] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(VOICE_LANG_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored === 'el-GR' || stored === 'en-US') setVoiceLang(stored);
  }, []);

  function toggleLang() {
    const next: VoiceLang = voiceLang === 'el-GR' ? 'en-US' : 'el-GR';
    setVoiceLang(next);
    window.localStorage.setItem(VOICE_LANG_KEY, next);
  }

  function toggle() {
    if (speech.listening) {
      speech.stop();
      return;
    }
    setTextBefore(text);
    setTranscriptBefore(transcript);
    speech.reset();
    speech.start(voiceLang);
  }

  // Built from the "before" values, so a final result that lands after onend
  // replaces the fold rather than appending the same words twice.
  const fold = useEffectEvent((spoken: string) => {
    onText(textBefore ? `${textBefore.trimEnd()} ${spoken}` : spoken);
    setTranscript(transcriptBefore ? `${transcriptBefore} ${spoken}` : spoken);
  });

  // stop() returns before the final result flushes, so this can't happen in the click handler.
  useEffect(() => {
    const spoken = speech.transcript.trim();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the Journal's fold-on-stop, via an effect event
    if (!speech.listening && spoken) fold(spoken);
  }, [speech.listening, speech.transcript]);

  function clear() {
    setTranscript(null);
    speech.reset();
  }

  return {
    supported: speech.supported,
    listening: speech.listening,
    error: speech.error,
    voiceLang,
    toggle,
    toggleLang,
    // What the field should show: the live transcript while recording, the real text otherwise.
    liveText: speech.listening
      ? [textBefore, speech.transcript, speech.interimTranscript].filter(Boolean).join(' ')
      : text,
    transcript,
    clear,
  };
}

export type Dictation = ReturnType<typeof useDictation>;
