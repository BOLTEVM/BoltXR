'use client';

import React, { useCallback, useEffect } from 'react';
import { Delete } from 'lucide-react';

interface PinEntryProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  maxLength?: number;
  /** Number of dot placeholders to show before any digits are entered. */
  placeholderLength?: number;
  disabled?: boolean;
  error?: boolean;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const;

/** Numeric PIN entry: on-screen keypad plus physical keyboard support. */
export default function PinEntry({
  value, onChange, onSubmit, maxLength = 12, placeholderLength = 6, disabled = false, error = false,
}: PinEntryProps) {
  const press = useCallback((key: typeof KEYS[number]) => {
    if (disabled) return;
    if (key === 'clear') onChange('');
    else if (key === 'back') onChange(value.slice(0, -1));
    else if (value.length < maxLength) onChange(value + key);
  }, [disabled, maxLength, onChange, value]);

  useEffect(() => {
    if (disabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        press(e.key as typeof KEYS[number]);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        press('back');
      } else if (e.key === 'Enter' && onSubmit) {
        e.preventDefault();
        onSubmit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [disabled, onSubmit, press]);

  const slots = Math.max(placeholderLength, value.length);

  return (
    <div className="flex flex-col gap-5">
      <div className="pin-dots" aria-live="polite" aria-label={`${value.length} digits entered`}>
        {Array.from({ length: slots }).map((_, i) => (
          <span
            key={i}
            className="pin-dot"
            data-filled={i < value.length}
            style={error ? { borderColor: 'var(--danger)', background: i < value.length ? 'var(--danger)' : undefined } : undefined}
          />
        ))}
      </div>
      <div className="pin-pad">
        {KEYS.map(key => (
          <button
            key={key}
            type="button"
            className={`pin-key ${key === 'clear' || key === 'back' ? 'pin-key-muted' : ''}`}
            onClick={() => press(key)}
            disabled={disabled}
            aria-label={key === 'back' ? 'Delete digit' : key === 'clear' ? 'Clear' : key}
          >
            {key === 'back' ? <Delete size={18} className="mx-auto" /> : key === 'clear' ? 'CLEAR' : key}
          </button>
        ))}
      </div>
    </div>
  );
}
