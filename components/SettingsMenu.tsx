'use client';

import React, { useState, useSyncExternalStore } from 'react';
import { Settings, Cpu, Layers, Zap, Link, ShieldCheck, Lock, Eye, Box, Hand } from 'lucide-react';
import Dialog from './ui/Dialog';
import PinEntry from './ui/PinEntry';
import { useSettings, AppStack } from '../hooks/useSettings';
import { useWallet } from '../hooks/useWallet';
import { lovense } from '../lib/lovense';
import { APP_VERSION } from '../lib/app-info';

const STACKS: { id: AppStack; label: string; desc: string; icon: typeof Box }[] = [
  { id: 'XR', label: 'Spatial XR', desc: 'WebXR · VR / AR / desktop 3D', icon: Box },
  { id: '2D', label: 'Hand Tracking', desc: 'Webcam · MediaPipe gestures', icon: Hand },
];

const subscribeLovense = (cb: () => void) => lovense.subscribe(cb);
const getLovenseConnected = () => lovense.getIsConnected();
const getLovenseServer = () => false;

function RecoveryPhraseReveal() {
  const { revealMnemonic, lockoutUntil } = useWallet();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [phrase, setPhrase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => { setOpen(false); setPin(''); setPhrase(null); setError(null); };

  const submit = async () => {
    if (pin.length < 4 || busy) return;
    if (lockoutUntil && Date.now() < lockoutUntil) {
      setError('Too many attempts — try again shortly');
      return;
    }
    setBusy(true);
    const result = await revealMnemonic(pin);
    setBusy(false);
    setPin('');
    if (result) setPhrase(result);
    else setError('Incorrect PIN');
  };

  if (!open) {
    return (
      <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
        <Eye size={14} /> Show recovery phrase
      </button>
    );
  }

  if (phrase) {
    return (
      <div className="flex flex-col gap-3">
        <div className="notice notice-warning">Never share these words. Anyone with them controls your funds.</div>
        <ol className="grid grid-cols-3 gap-2">
          {phrase.split(' ').map((word, i) => (
            <li key={i} className="card px-2 py-1.5 mono text-[11px] flex gap-1.5">
              <span className="text-slate-500">{i + 1}.</span>{word}
            </li>
          ))}
        </ol>
        <button type="button" className="btn btn-sm self-end" onClick={reset}>Hide</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-slate-400">Re-enter your PIN to view the recovery phrase.</p>
      <PinEntry value={pin} onChange={v => { setPin(v); setError(null); }} onSubmit={submit} disabled={busy} error={!!error} placeholderLength={6} />
      {error && <div className="notice notice-danger" role="alert">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" className="btn btn-sm" onClick={reset}>Cancel</button>
        <button type="button" className="btn btn-sm btn-primary" onClick={submit} disabled={busy || pin.length < 4}>Reveal</button>
      </div>
    </div>
  );
}

const SettingsMenu: React.FC = () => {
  const {
    showSettings,
    setShowSettings,
    activeStack,
    setActiveStack,
    modelComplexity,
    setModelComplexity,
    hapticsEnabled,
    setHapticsEnabled,
    lovenseToken,
    setLovenseToken
  } = useSettings();
  const wallet = useWallet();
  const lovenseConnected = useSyncExternalStore(subscribeLovense, getLovenseConnected, getLovenseServer);

  return (
    <Dialog
      open={showSettings}
      onClose={() => setShowSettings(false)}
      icon={<Settings className="text-purple-400 h-5 w-5" />}
      title="System Config"
      footer={`BOLT XR LABS · v${APP_VERSION}`}
    >
      <div className="flex flex-col gap-8">
        {/* STACK SELECTION */}
        <section>
          <div className="section-title"><Layers size={14} /> Interface</div>
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Interface stack">
            {STACKS.map(({ id, label, desc, icon: Icon }) => {
              const active = activeStack === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setActiveStack(id)}
                  className={`text-left p-4 rounded-2xl border transition-colors ${active
                    ? 'bg-purple-500/10 border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.12)]'
                    : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.05] hover:border-white/20'}`}
                >
                  <Icon size={18} className={active ? 'text-purple-400 mb-2' : 'text-slate-500 mb-2'} />
                  <div className="text-xs font-extrabold tracking-wider uppercase">{label}</div>
                  <div className="text-[10px] text-slate-500 mt-1">{desc}</div>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
            Spatial XR starts a WebXR session when you choose VR or AR — make sure your headset is connected and WebXR is enabled in your browser.
          </p>
        </section>

        {/* SECURITY */}
        <section>
          <div className="section-title"><ShieldCheck size={14} /> Security</div>
          <div className="card p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold">Vault</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Auto-locks after 15 minutes without activity</div>
              </div>
              <span className={`pill ${wallet.status === 'unlocked' ? 'pill-success' : wallet.status === 'no-vault' ? '' : 'pill-warning'}`}>
                {wallet.status === 'unlocked' ? 'Unlocked' : wallet.status === 'no-vault' ? 'Not set up' : 'Locked'}
              </span>
            </div>
            {wallet.status === 'unlocked' && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-sm" onClick={wallet.lock}>
                  <Lock size={14} /> Lock now
                </button>
                <RecoveryPhraseReveal />
              </div>
            )}
          </div>
        </section>

        {/* PERFORMANCE */}
        <section>
          <div className="section-title"><Cpu size={14} /> Hand tracking</div>
          <div className="card flex items-center justify-between gap-4 p-4">
            <div>
              <div className="text-sm font-bold">Model complexity</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Full is more precise; Lite is faster on slower machines</div>
            </div>
            <div className="segmented" role="group" aria-label="Model complexity">
              <button type="button" aria-pressed={modelComplexity === 0} onClick={() => setModelComplexity(0)}>LITE</button>
              <button type="button" aria-pressed={modelComplexity === 1} onClick={() => setModelComplexity(1)}>FULL</button>
            </div>
          </div>
        </section>

        {/* HAPTICS */}
        <section>
          <div className="section-title"><Zap size={14} /> Haptics</div>
          <div className="flex flex-col gap-3">
            <div className="card flex items-center justify-between gap-4 p-4">
              <div>
                <div className="text-sm font-bold">Haptic feedback</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Pinch and tap confirmation via Lovense Connect</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={hapticsEnabled}
                aria-label="Haptic feedback"
                onClick={() => setHapticsEnabled(!hapticsEnabled)}
                className={`relative h-6 w-11 rounded-full transition-colors ${hapticsEnabled ? 'bg-purple-500' : 'bg-white/15'}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${hapticsEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div className={`card p-4 transition-opacity ${hapticsEnabled ? '' : 'opacity-50'}`} aria-disabled={!hapticsEnabled}>
              <div className="flex items-center justify-between mb-3">
                <label htmlFor="lovense-token" className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                  <Link size={12} className="text-purple-400" /> Lovense token
                </label>
                <span className={`pill ${lovenseConnected ? 'pill-success' : 'pill-danger'}`}>
                  {lovenseConnected ? 'Connected' : 'Offline'}
                </span>
              </div>
              <input
                id="lovense-token"
                type="password"
                value={lovenseToken}
                disabled={!hapticsEnabled}
                onChange={(e) => setLovenseToken(e.target.value)}
                onBlur={() => lovense.setToken(lovenseToken)}
                placeholder="Developer token"
                autoComplete="off"
                className="input"
              />
            </div>
          </div>
        </section>
      </div>
    </Dialog>
  );
};

export default SettingsMenu;
