import React from 'react';
import { Settings, QrCode, FileCode2, LogOut, Lock, LockOpen, KeyRound } from 'lucide-react';
import type { VaultStatus } from '@/hooks/useWallet';

export type HandMode = 'wallet' | 'playground';
export type Tone = 'ok' | 'warn' | 'error' | 'idle';

interface HUDSystemProps {
  trackingLabel: string;
  trackingTone: Tone;
  pinching: boolean;
  interactionInfo: string;
  mode: HandMode;
  onModeChange: (mode: HandMode) => void;
  vaultStatus: VaultStatus;
  onVaultClick: () => void;
  onExit: () => void;
  onOpenSettings: () => void;
  onOpenQR?: () => void;
  onOpenContracts?: () => void;
}

const TONE_COLOR: Record<Tone, string> = {
  ok: '#34d399',
  warn: '#fbbf24',
  error: '#f87171',
  idle: '#94a3b8',
};

const HUDSystem: React.FC<HUDSystemProps> = ({
  trackingLabel,
  trackingTone,
  pinching,
  interactionInfo,
  mode,
  onModeChange,
  vaultStatus,
  onVaultClick,
  onExit,
  onOpenSettings,
  onOpenQR,
  onOpenContracts,
}) => {
  const vaultLabel = vaultStatus === 'unlocked' ? 'Unlocked' : vaultStatus === 'no-vault' ? 'Set up vault' : 'Locked';
  const VaultIcon = vaultStatus === 'unlocked' ? LockOpen : vaultStatus === 'no-vault' ? KeyRound : Lock;

  return (
    <>
      <div className="scan-line" />
      <div className="vignette" />

      <header className="fixed inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-4 sm:p-5 pointer-events-none">
        {/* Tracking status */}
        <div className="glass rounded-2xl px-4 py-3 pointer-events-auto min-w-0" role="status" aria-live="polite">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              {trackingTone === 'ok' && <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: TONE_COLOR.ok }} />}
              <span className="relative h-2.5 w-2.5 rounded-full" style={{ background: TONE_COLOR[trackingTone] }} />
            </span>
            <span className="mono text-[10px] tracking-[0.15em] uppercase text-slate-200 truncate">{trackingLabel}</span>
          </div>
          <div className="mono text-[10px] tracking-[0.15em] uppercase mt-1.5 text-cyan-300/70 hidden sm:block">
            {pinching ? '● Pinching' : '○ Open hand'}{interactionInfo ? ` · ${interactionInfo}` : ''}
          </div>
        </div>

        {/* Title & mode */}
        <div className="hidden md:flex flex-col items-center gap-2 pointer-events-auto">
          <div className="font-heading text-sm tracking-[0.45em] text-white/40">BOLT XR · HAND INTERFACE</div>
          <div className="segmented" role="group" aria-label="Interface mode">
            <button type="button" aria-pressed={mode === 'wallet'} onClick={() => onModeChange('wallet')}>WALLET</button>
            <button type="button" aria-pressed={mode === 'playground'} onClick={() => onModeChange('playground')}>PLAYGROUND</button>
          </div>
        </div>

        {/* Toolbar */}
        <nav className="flex items-center gap-2 pointer-events-auto" aria-label="Wallet tools">
          <button
            type="button"
            onClick={onVaultClick}
            className={`btn btn-sm ${vaultStatus === 'unlocked' ? '' : 'btn-primary'}`}
            title={vaultStatus === 'unlocked' ? 'Lock vault' : 'Unlock vault'}
          >
            <VaultIcon size={14} /> <span className="hidden sm:inline">{vaultLabel}</span>
          </button>
          {onOpenQR && (
            <button type="button" className="icon-btn glass" onClick={onOpenQR} aria-label="QR terminal" title="QR terminal"><QrCode size={16} /></button>
          )}
          {onOpenContracts && (
            <button type="button" className="icon-btn glass hidden sm:inline-flex" onClick={onOpenContracts} aria-label="Contracts" title="Contracts"><FileCode2 size={16} /></button>
          )}
          <button type="button" className="icon-btn glass" onClick={onOpenSettings} aria-label="Settings" title="Settings"><Settings size={16} /></button>
          <button type="button" className="icon-btn glass" onClick={onExit} aria-label="Exit to home" title="Exit"><LogOut size={16} /></button>
        </nav>
      </header>

      {/* Mobile mode switch */}
      <div className="md:hidden fixed top-[76px] left-1/2 -translate-x-1/2 z-30">
        <div className="segmented" role="group" aria-label="Interface mode">
          <button type="button" aria-pressed={mode === 'wallet'} onClick={() => onModeChange('wallet')}>WALLET</button>
          <button type="button" aria-pressed={mode === 'playground'} onClick={() => onModeChange('playground')}>PLAYGROUND</button>
        </div>
      </div>

      <div className="status-bar hidden sm:block">
        PINCH = TAP · PINCH + MOVE = DRAG · TWO-HAND PINCH = RESIZE
      </div>
    </>
  );
};

export default HUDSystem;
