'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import styles from './modal.module.css';

type ModalProps = {
  open: boolean;
  eyebrow: string;
  onClose: () => void;
  width?: number;
  children: ReactNode;
};

export default function Modal({ open, eyebrow, onClose, width = 480, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // The modal starts closed and only opens from a client interaction, so the
  // portal never renders during SSR — guard document.body for the server pass.
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.container}
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
