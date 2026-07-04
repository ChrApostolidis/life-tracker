'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Minimal Web Speech API declarations ─────────────────────────────────────
// SpeechRecognition is not in lib.dom; declare only the surface we use.
// Speech-to-text happens in the browser — no audio is recorded or stored.

interface SpeechAlternative {
  transcript: string;
}

interface SpeechResult {
  isFinal: boolean;
  0: SpeechAlternative;
}

interface SpeechResultList {
  length: number;
  [index: number]: SpeechResult;
}

interface SpeechResultEvent {
  resultIndex: number;
  results: SpeechResultList;
}

interface SpeechErrorEvent {
  error: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

// Recognizer error codes → UI copy (no exclamation points).
function describeSpeechError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access was denied. Allow it in the browser and try again.';
    case 'audio-capture':
      return 'No microphone was found.';
    case 'no-speech':
      return 'No speech was detected.';
    case 'network':
      return 'The speech service could not be reached.';
    default:
      return `Voice capture failed (${code}).`;
  }
}

export type SpeechRecognitionState = {
  supported: boolean;
  listening: boolean;
  transcript: string; // accumulated final results
  interimTranscript: string; // live, not yet final
  error: string | null;
  start: (lang: string) => void;
  stop: () => void;
  reset: () => void;
};

export function useSpeechRecognition(): SpeechRecognitionState {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // Plain lookup, false during SSR — fine for client-only mounts (the capture
  // modal). An SSR-rendered consumer would need mount-gated detection instead.
  const supported = getCtor() !== null;

  useEffect(() => {
    return () => recognitionRef.current?.abort();
  }, []);

  const start = useCallback((lang: string) => {
    const Ctor = getCtor();
    if (!Ctor || recognitionRef.current) return; // unsupported or already listening

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          const finalText = result[0].transcript.trim();
          if (finalText) setTranscript((prev) => (prev ? `${prev} ${finalText}` : finalText));
        } else {
          interim += result[0].transcript;
        }
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (e) => {
      // 'aborted' fires on our own cleanup — not a user-facing failure.
      if (e.error !== 'aborted') setError(describeSpeechError(e.error));
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      setInterimTranscript('');
    };

    setError(null);
    setInterimTranscript('');
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, []);

  const stop = useCallback(() => {
    // stop() lets pending final results flush before onend fires.
    recognitionRef.current?.stop();
  }, []);

  const reset = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setError(null);
  }, []);

  return { supported, listening, transcript, interimTranscript, error, start, stop, reset };
}
