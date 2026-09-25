'use client';

import React, { useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Rendered between the header and the scrollable body (e.g. tabs). */
  toolbar?: React.ReactNode;
  footer?: React.ReactNode;
  /** When false, Escape / backdrop clicks do not close the dialog. */
  dismissible?: boolean;
  children: React.ReactNode;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Only the top-most open dialog reacts to Escape / Tab.
const dialogStack: string[] = [];

export default function Dialog({
  open, onClose, title, icon, size = 'md', toolbar, footer, dismissible = true, children,
}: DialogProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);

  useEffect(() => {
    onCloseRef.current = onClose;
    dismissibleRef.current = dismissible;
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogStack.push(id);

    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      const preferred = panel.querySelector<HTMLElement>('[data-autofocus]');
      (preferred || panel.querySelector<HTMLElement>(FOCUSABLE) || panel).focus();
    }, 30);

    const onKeyDown = (e: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== id) return;
      if (e.key === 'Escape' && dismissibleRef.current) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
          .filter(n => n.offsetParent !== null);
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
      const index = dialogStack.lastIndexOf(id);
      if (index !== -1) dialogStack.splice(index, 1);
      previouslyFocused?.focus?.();
    };
  }, [open, id]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="dialog-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={e => {
            if (e.target === e.currentTarget && dismissible) onClose();
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={`dialog dialog-${size}`}
            initial={{ scale: 0.96, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 12 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            <div className="dialog-header">
              <h2 id={titleId} className="dialog-title">
                {icon}
                <span>{title}</span>
              </h2>
              {dismissible && (
                <button type="button" onClick={onClose} className="icon-btn" aria-label="Close">
                  <X size={18} />
                </button>
              )}
            </div>
            {toolbar}
            <div className="dialog-body">{children}</div>
            {footer && <div className="dialog-footer">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
