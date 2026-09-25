'use client';

import React, { useState } from 'react';
import { KeyRound, Lock, ShieldCheck, Eye, EyeOff, AlertTriangle, RotateCcw } from 'lucide-react';
import Dialog from './ui/Dialog';
import PinEntry from './ui/PinEntry';
import { useWallet, MIN_NEW_PIN_LENGTH } from '@/hooks/useWallet';
import { useCountdown } from '@/hooks/useCountdown';
import { errorMessage } from '@/lib/format';

type Step =
  | { kind: 'unlock' }
  | { kind: 'choose' }
  | { kind: 'new-pin'; purpose: 'create' | 'restore'; phrase?: string }
  | { kind: 'confirm-pin'; purpose: 'create' | 'restore'; pin: string; phrase?: string }
  | { kind: 'restore-phrase'; replacing: boolean }
  | { kind: 'backup'; mnemonic: string };

interface VaultDialogProps {
  open: boolean;
  onClose: () => void;
}

/** 2D vault gate: create, restore or unlock the on-device vault. */
export default function VaultDialog({ open, onClose }: VaultDialogProps) {
  const wallet = useWallet();
  const initialStep: Step = wallet.status === 'no-vault' ? { kind: 'choose' } : { kind: 'unlock' };
  const [step, setStep] = useState<Step>(initialStep);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [phrase, setPhrase] = useState('');
  const lockoutSeconds = useCountdown(wallet.lockoutUntil);
  const lockedOut = lockoutSeconds > 0;

  // Re-sync the entry step whenever the dialog is re-opened.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep(wallet.status === 'no-vault' ? { kind: 'choose' } : { kind: 'unlock' });
      setPin('');
      setError(null);
      setRevealed(false);
      setAcknowledged(false);
      setPhrase('');
    }
  }

  const goto = (next: Step) => {
    setStep(next);
    setPin('');
    setError(null);
  };

  const submitUnlock = async () => {
    if (busy || lockedOut || pin.length < 4) return;
    setBusy(true);
    const result = await wallet.unlock(pin);
    setBusy(false);
    setPin('');
    if (result.ok) onClose();
    else setError(result.error || 'Incorrect PIN');
  };

  const submitNewPin = () => {
    if (step.kind !== 'new-pin') return;
    if (pin.length < MIN_NEW_PIN_LENGTH) {
      setError(`Use at least ${MIN_NEW_PIN_LENGTH} digits`);
      return;
    }
    if (/^(\d)\1+$/.test(pin) || '0123456789012'.includes(pin) || '9876543210987'.includes(pin)) {
      setError('Avoid repeated or sequential digits');
      return;
    }
    goto({ kind: 'confirm-pin', purpose: step.purpose, pin, phrase: step.phrase });
  };

  const submitConfirm = async () => {
    if (step.kind !== 'confirm-pin' || busy) return;
    if (pin !== step.pin) {
      setError('PINs do not match');
      setPin('');
      return;
    }
    setBusy(true);
    try {
      if (step.purpose === 'create') {
        const mnemonic = await wallet.setup(pin);
        if (!mnemonic) throw new Error('Vault setup failed');
        goto({ kind: 'backup', mnemonic });
      } else {
        await wallet.restore(step.phrase || '', pin);
        onClose();
      }
    } catch (e) {
      setError(errorMessage(e));
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const submitPhrase = () => {
    const words = phrase.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (![12, 15, 18, 21, 24].includes(words.length)) {
      setError('Recovery phrases have 12, 15, 18, 21 or 24 words');
      return;
    }
    goto({ kind: 'new-pin', purpose: 'restore', phrase: words.join(' ') });
  };

  const titles: Record<Step['kind'], string> = {
    unlock: 'Unlock Vault',
    choose: 'Set Up Your Vault',
    'new-pin': 'Choose a PIN',
    'confirm-pin': 'Confirm PIN',
    'restore-phrase': 'Restore Wallet',
    backup: 'Back Up Your Phrase',
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      dismissible={step.kind !== 'backup'}
      icon={step.kind === 'unlock' ? <Lock className="h-5 w-5 text-purple-400" /> : <KeyRound className="h-5 w-5 text-purple-400" />}
      title={titles[step.kind]}
      footer="AES-256-GCM · PBKDF2 600K · On-device only"
    >
      {step.kind === 'choose' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-400 leading-relaxed mb-2">
            Your keys are generated and encrypted on this device. Nothing is sent to a server.
          </p>
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => goto({ kind: 'new-pin', purpose: 'create' })} data-autofocus>
            <ShieldCheck size={18} /> Create new wallet
          </button>
          <button type="button" className="btn btn-lg btn-block" onClick={() => goto({ kind: 'restore-phrase', replacing: false })}>
            <RotateCcw size={16} /> Restore from recovery phrase
          </button>
        </div>
      )}

      {step.kind === 'unlock' && (
        <div className="flex flex-col gap-5">
          <p className="text-center text-sm text-slate-400">
            {lockedOut ? 'Too many incorrect attempts.' : 'Enter your PIN to unlock your wallet.'}
          </p>
          <PinEntry value={pin} onChange={v => { setPin(v); setError(null); }} onSubmit={submitUnlock} disabled={busy || lockedOut} error={!!error} />
          {lockedOut ? (
            <div className="notice notice-danger justify-center" role="alert">Try again in {lockoutSeconds}s</div>
          ) : error ? (
            <div className="notice notice-danger justify-center" role="alert">
              {error}{wallet.failedAttempts > 0 ? ` · ${wallet.failedAttempts} failed attempt${wallet.failedAttempts === 1 ? '' : 's'}` : ''}
            </div>
          ) : null}
          <button type="button" className="btn btn-primary btn-block" onClick={submitUnlock} disabled={busy || lockedOut || pin.length < 4}>
            {busy ? 'Unlocking…' : 'Unlock'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm self-center" onClick={() => goto({ kind: 'restore-phrase', replacing: true })}>
            Forgot PIN? Restore from phrase
          </button>
        </div>
      )}

      {(step.kind === 'new-pin' || step.kind === 'confirm-pin') && (
        <div className="flex flex-col gap-5">
          <p className="text-center text-sm text-slate-400">
            {step.kind === 'new-pin'
              ? `Pick a PIN of at least ${MIN_NEW_PIN_LENGTH} digits. It encrypts your vault on this device.`
              : 'Enter the same PIN again.'}
          </p>
          <PinEntry
            value={pin}
            onChange={v => { setPin(v); setError(null); }}
            onSubmit={step.kind === 'new-pin' ? submitNewPin : submitConfirm}
            disabled={busy}
            error={!!error}
          />
          {error && <div className="notice notice-danger justify-center" role="alert">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="btn"
              onClick={() => step.kind === 'confirm-pin'
                ? goto({ kind: 'new-pin', purpose: step.purpose, phrase: step.phrase })
                : goto(step.purpose === 'restore' ? { kind: 'restore-phrase', replacing: wallet.status !== 'no-vault' } : { kind: 'choose' })}
              disabled={busy}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={step.kind === 'new-pin' ? submitNewPin : submitConfirm}
              disabled={busy || pin.length < MIN_NEW_PIN_LENGTH}
            >
              {busy ? 'Working…' : step.kind === 'new-pin' ? 'Continue' : step.purpose === 'create' ? 'Create vault' : 'Restore'}
            </button>
          </div>
        </div>
      )}

      {step.kind === 'restore-phrase' && (
        <div className="flex flex-col gap-4">
          {step.replacing && (
            <div className="notice notice-warning" role="alert">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>This replaces the vault on this device. Only continue if you have the recovery phrase for the wallet you want to keep.</span>
            </div>
          )}
          <label>
            <span className="field-label">Recovery phrase</span>
            <textarea
              className="input"
              rows={4}
              value={phrase}
              onChange={e => { setPhrase(e.target.value); setError(null); }}
              placeholder="word1 word2 word3 …"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              data-autofocus
              aria-invalid={!!error}
            />
          </label>
          {error && <div className="notice notice-danger" role="alert">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className="btn" onClick={() => goto(wallet.status === 'no-vault' ? { kind: 'choose' } : { kind: 'unlock' })}>Back</button>
            <button type="button" className="btn btn-primary" onClick={submitPhrase} disabled={!phrase.trim()}>Continue</button>
          </div>
        </div>
      )}

      {step.kind === 'backup' && (
        <div className="flex flex-col gap-4">
          <div className="notice notice-warning">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>Write these words down in order and keep them offline. Anyone with them controls your funds, and they are the only way to recover your wallet.</span>
          </div>
          <div className="relative">
            <ol className={`grid grid-cols-2 sm:grid-cols-3 gap-2 transition ${revealed ? '' : 'blur-md select-none'}`} aria-hidden={!revealed}>
              {step.mnemonic.split(' ').map((word, i) => (
                <li key={i} className="card px-3 py-2 mono text-xs flex gap-2">
                  <span className="text-slate-500 w-5 text-right">{i + 1}.</span>
                  <span>{word}</span>
                </li>
              ))}
            </ol>
            {!revealed && (
              <button type="button" className="btn absolute inset-0 m-auto w-fit h-fit" onClick={() => setRevealed(true)} data-autofocus>
                <Eye size={16} /> Reveal phrase
              </button>
            )}
          </div>
          {revealed && (
            <button type="button" className="btn btn-ghost btn-sm self-center" onClick={() => setRevealed(false)}>
              <EyeOff size={14} /> Hide
            </button>
          )}
          <label className="flex items-start gap-3 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" className="mt-1 accent-purple-500" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />
            I have written down my recovery phrase and stored it somewhere safe.
          </label>
          <button type="button" className="btn btn-primary btn-block" disabled={!acknowledged} onClick={onClose}>
            Done
          </button>
        </div>
      )}
    </Dialog>
  );
}
