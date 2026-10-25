'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrophone } from '@fortawesome/free-solid-svg-icons';
import type { Dictation } from '@/lib/use-dictation';
import styles from './dictationControls.module.css';

// The mic and its EL/EN chip. `hint` names where the words go, e.g. "Dictate into this update".
export default function DictationControls({ dictation, hint }: { dictation: Dictation; hint: string }) {
  const { supported, listening } = dictation;
  return (
    <>
      <button
        type="button"
        className={[styles.micBtn, listening ? styles.micBtnActive : ''].filter(Boolean).join(' ')}
        onClick={dictation.toggle}
        disabled={!supported}
        title={
          supported
            ? listening
              ? 'Stop recording'
              : hint
            : 'Voice capture needs Chrome or Edge on a secure connection'
        }
        aria-label={listening ? 'Stop recording' : 'Record voice'}
      >
        <FontAwesomeIcon icon={faMicrophone} />
      </button>
      <button
        type="button"
        className={styles.langChip}
        onClick={dictation.toggleLang}
        disabled={listening}
        title="Voice language"
      >
        {dictation.voiceLang === 'el-GR' ? 'EL' : 'EN'}
      </button>
    </>
  );
}
