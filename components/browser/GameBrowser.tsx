'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Cookie, Download, Gamepad2, Home, Link2, Lock, LockOpen, LogOut, Plus, RotateCw, Shield, Trash2, Unlink, X,
} from 'lucide-react';
import VaultDialog from '../VaultDialog';
import { useWallet } from '@/hooks/useWallet';
import { useSettings } from '@/hooks/useSettings';
import { useDappBridge } from '@/hooks/useDappBridge';
import { getDesktop, HOME_SITES, KNOWN_ORIGINS } from '@/lib/desktop';
import { QUAI_NETWORK_KEYS, getQuaiNetwork, type QuaiNetworkKey } from '@/lib/boltows/quai';
import { RELEASES_URL } from '@/lib/app-info';

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function WebOnly({ onExit }: { onExit: () => void }) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-[#020617] p-4">
      <div className="glass rounded-3xl p-7 max-w-md flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Gamepad2 className="h-6 w-6 text-purple-400" aria-hidden />
          <h1 className="text-3xl leading-none">Game browser</h1>
        </div>
        <p className="text-sm text-slate-300 leading-relaxed">
          Playing BEAM games with your Bolt XR Quai account needs the Bolt XR desktop app: it runs each game in its own
          sandboxed browser and connects it to your wallet. Web pages can&apos;t do that from inside another page.
        </p>
        <p className="text-sm text-slate-400 leading-relaxed">
          In a regular browser, BEAM connects through the Pelagus extension instead.
        </p>
        <div className="flex flex-wrap gap-3">
          <a className="btn btn-primary" href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
            <Download size={16} /> Get the desktop app
          </a>
          <button type="button" className="btn" onClick={onExit}>Back</button>
        </div>
      </div>
    </div>
  );
}

export default function GameBrowser({ onExit }: { onExit: () => void }) {
  const desktop = getDesktop();
  if (!desktop) return <WebOnly onExit={onExit} />;
  return <DesktopBrowser onExit={onExit} />;
}

function DesktopBrowser({ onExit }: { onExit: () => void }) {
  const desktop = getDesktop()!;
  const wallet = useWallet();
  const { showSettings } = useSettings();
  const { network, setNetworkKey, connections, disconnect, browserState, notice, clearNotice } = useDappBridge();

  const viewportRef = useRef<HTMLDivElement>(null);
  const [address, setAddress] = useState('');
  const [editing, setEditing] = useState(false);
  const [showHome, setShowHome] = useState(() => !browserState?.url || browserState.url === 'about:blank');
  const [showShields, setShowShields] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPage = !!browserState?.url && browserState.url !== 'about:blank';
  const fullscreen = !!browserState?.fullscreen;
  // The page is a native layer above this window: hide it whenever our own UI must be seen.
  const pageVisible = hasPage && !showHome && !showShields && !vaultOpen && !showSettings;

  const quai = wallet.status === 'unlocked' ? wallet.addresses.quai : undefined;
  const origin = browserState?.origin ?? null;
  const connected = !!origin && connections.some(c => c.origin === origin);

  // Report where the page should be drawn.
  const report = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    desktop.browser.layout({ visible: pageVisible, bounds: { x: r.left, y: r.top, width: r.width, height: r.height } });
  }, [desktop, pageVisible]);

  useLayoutEffect(() => {
    report();
    const el = viewportRef.current;
    const observer = new ResizeObserver(report);
    if (el) observer.observe(el);
    window.addEventListener('resize', report);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', report);
    };
  }, [report]);

  // Leaving the browser hides the page (it keeps running, so a game can be resumed).
  useEffect(() => () => desktop.browser.layout({ visible: false, bounds: { x: 0, y: 0, width: 0, height: 0 } }), [desktop]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(clearNotice, 5000);
    return () => clearTimeout(t);
  }, [notice, clearNotice]);

  const open = async (input: string) => {
    setError(null);
    const result = await desktop.browser.open(input);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setEditing(false);
    setShowHome(false);
    setShowShields(false);
  };

  const newTab = async () => {
    const id = await desktop.browser.newTab();
    if (id !== null) {
      setShowHome(true);
      setShowShields(false);
      setError(null);
    }
  };

  const accountPill = wallet.status === 'unlocked' && quai ? (
    <button type="button" className="pill pill-success mono" title={`${quai}\nClick to lock Bolt XR`} onClick={wallet.lock} data-testid="account-pill">
      <LockOpen size={12} /> {short(quai)}
    </button>
  ) : (
    <button type="button" className="pill pill-warning" onClick={() => setVaultOpen(true)} data-testid="account-pill">
      <Lock size={12} /> {wallet.status === 'no-vault' ? 'Set up vault' : 'Unlock'}
    </button>
  );

  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-[#020617] text-white" data-testid="game-browser">
      {!fullscreen && (
        <>
        <nav className="flex items-center gap-1 overflow-x-auto border-b border-white/10 bg-slate-950/95 px-2 py-1.5" aria-label="Chromium tabs">
          {(browserState?.tabs ?? []).map(tab => (
            <div key={tab.id} className={`group flex min-w-0 max-w-56 flex-1 items-center rounded-lg border text-xs ${tab.id === browserState?.tabId ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100' : 'border-transparent text-slate-400 hover:bg-white/5'}`}>
              <button
                type="button"
                className="min-w-0 flex-1 truncate px-3 py-2 text-left"
                onClick={() => { desktop.browser.activateTab(tab.id); setShowHome(false); setShowShields(false); }}
                data-testid={`browser-tab-${tab.id}`}
                title={tab.url || 'New isolated tab'}
              >
                {tab.loading ? '◌ ' : ''}{tab.title || 'New isolated tab'}
              </button>
              <button type="button" className="p-2 text-slate-500 hover:text-rose-300" aria-label={`Close ${tab.title || 'tab'}`} onClick={() => desktop.browser.closeTab(tab.id)}><X size={12} /></button>
            </div>
          ))}
          <button type="button" className="icon-btn shrink-0" onClick={newTab} aria-label="New isolated tab" title="New isolated tab" data-testid="new-tab"><Plus size={16} /></button>
          <span className="ml-auto hidden shrink-0 items-center gap-1 px-2 text-[10px] text-emerald-300 sm:flex"><Shield size={12} /> Isolated per tab</span>
        </nav>
        <header className="glass-dark flex items-center gap-2 px-3 py-2 border-b border-white/10">
          <button type="button" className="icon-btn" onClick={onExit} aria-label="Back to wallet" title="Back to wallet"><LogOut size={16} /></button>
          <button type="button" className="icon-btn" onClick={() => setShowHome(true)} aria-label="Browser home" title="Home"><Home size={16} /></button>
          <button type="button" className="icon-btn" onClick={() => desktop.browser.command('back')} disabled={!browserState?.canGoBack || showHome} aria-label="Back"><ArrowLeft size={16} /></button>
          <button type="button" className="icon-btn" onClick={() => desktop.browser.command('forward')} disabled={!browserState?.canGoForward || showHome} aria-label="Forward"><ArrowRight size={16} /></button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => desktop.browser.command(browserState?.loading ? 'stop' : 'reload')}
            disabled={!hasPage || showHome}
            aria-label={browserState?.loading ? 'Stop' : 'Reload'}
          >
            {browserState?.loading ? <X size={16} /> : <RotateCw size={16} />}
          </button>

          <form
            className="flex-1 min-w-0"
            onSubmit={e => { e.preventDefault(); open(address); }}
          >
            <input
              className="input mono !py-1.5 text-[13px] w-full"
              value={editing ? address : browserState?.url ?? ''}
              onFocus={() => { setAddress(browserState?.url ?? ''); setEditing(true); }}
              onBlur={() => setEditing(false)}
              onChange={e => setAddress(e.target.value)}
              placeholder="beam.boltevm.com"
              aria-label="Address"
              spellCheck={false}
            />
          </form>

          {origin && !showHome && (
            connected
              ? <span className="pill pill-brand hidden md:inline-flex" title={`${origin} can see your Quai account`}><Link2 size={12} /> Linked</span>
              : <span className="pill hidden md:inline-flex" title="This site has not asked to connect">Not linked</span>
          )}

          <button
            type="button"
            className={`icon-btn ${showShields ? 'text-emerald-300 bg-emerald-400/10' : ''}`}
            onClick={() => { setShowShields(!showShields); setShowHome(false); }}
            aria-label="Bolt Shield privacy controls"
            title="Bolt Shield privacy controls"
          ><Shield size={16} /></button>
          <label className="sr-only" htmlFor="quai-network">Quai network</label>
          <select
            id="quai-network"
            className="input !py-1.5 !w-auto text-[12px]"
            value={network.key}
            onChange={e => setNetworkKey(e.target.value as QuaiNetworkKey)}
            title="Quai network sites see"
          >
            {QUAI_NETWORK_KEYS.map(k => <option key={k} value={k}>{getQuaiNetwork(k).shortName}</option>)}
          </select>
          {accountPill}
        </header>
        </>
      )}

      {(error || browserState?.error) && !showHome && !fullscreen && (
        <div className="notice notice-danger mx-3 mt-2" role="alert">{error ?? browserState?.error}</div>
      )}
      {error && showHome && <div className="notice notice-danger mx-3 mt-2" role="alert">{error}</div>}
      {/* Above the page, not over it: the page is a native layer that would cover a floating toast. */}
      {notice && !fullscreen && <div className="notice notice-warning mx-3 mt-2" role="status">{notice}</div>}

      <div ref={viewportRef} className="relative flex-1 min-h-0" data-testid="browser-viewport">
        {showShields && (
          <div className="absolute inset-0 overflow-auto bg-[#020617]">
            <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 py-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-2xl font-semibold"><Shield className="text-emerald-300" /> Bolt Shield</div>
                  <p className="mt-1 text-sm text-slate-400">Protection for this isolated Chromium tab. No cookies or storage are shared with other tabs or your vault.</p>
                </div>
                <button type="button" className="icon-btn" onClick={() => setShowShields(false)} aria-label="Close privacy controls"><X size={18} /></button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="glass rounded-2xl p-4"><div className="text-2xl font-semibold text-emerald-300">{browserState?.stats.trackers ?? 0}</div><div className="text-xs text-slate-400">Trackers blocked</div></div>
                <div className="glass rounded-2xl p-4"><div className="text-2xl font-semibold text-cyan-300">{browserState?.stats.cookies ?? 0}</div><div className="text-xs text-slate-400">Cookie attempts stripped</div></div>
                <div className="glass rounded-2xl p-4"><div className="text-2xl font-semibold">{browserState?.stats.requests ?? 0}</div><div className="text-xs text-slate-400">Subresource requests</div></div>
              </div>
              <div className="glass flex items-center gap-4 rounded-2xl p-4">
                <Shield className="shrink-0 text-emerald-300" />
                <div className="min-w-0 flex-1"><div className="font-medium">Tracker shield</div><div className="text-xs text-slate-400">Block known third-party analytics, advertising, and behavior-tracking hosts.</div></div>
                <button type="button" role="switch" aria-checked={browserState?.shields.trackers ?? true} data-testid="shield-toggle-trackers" className={`rounded-full px-3 py-1.5 text-xs font-semibold ${browserState?.shields.trackers !== false ? 'bg-emerald-500 text-emerald-950' : 'bg-slate-700'}`} onClick={() => desktop.browser.setShield('trackers', !(browserState?.shields.trackers ?? true))}>{browserState?.shields.trackers !== false ? 'ON' : 'OFF'}</button>
              </div>
              <div className="glass flex items-center gap-4 rounded-2xl p-4">
                <Cookie className="shrink-0 text-cyan-300" />
                <div className="min-w-0 flex-1"><div className="font-medium">Third-party cookie shield</div><div className="text-xs text-slate-400">Strip cross-site Cookie and Set-Cookie headers while preserving first-party sign-in.</div></div>
                <button type="button" role="switch" aria-checked={browserState?.shields.thirdPartyCookies ?? true} data-testid="shield-toggle-cookies" className={`rounded-full px-3 py-1.5 text-xs font-semibold ${browserState?.shields.thirdPartyCookies !== false ? 'bg-emerald-500 text-emerald-950' : 'bg-slate-700'}`} onClick={() => desktop.browser.setShield('thirdPartyCookies', !(browserState?.shields.thirdPartyCookies ?? true))}>{browserState?.shields.thirdPartyCookies !== false ? 'ON' : 'OFF'}</button>
              </div>
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/5 p-4 text-xs leading-relaxed text-amber-100/80">
                HTTPS-only navigation, sandboxed renderers, blocked downloads/popups, restricted permissions, and explicit wallet approvals remain on. Bolt Shield does not make a malicious site safe.
              </div>
              <button type="button" className="btn border-rose-400/20 text-rose-200" disabled={!browserState?.tabId} onClick={() => { void desktop.browser.clearSiteData(); }}><Trash2 size={15} /> Clear this tab&apos;s cookies, cache, and site data</button>
              {hasPage && <button type="button" className="btn btn-primary" onClick={() => setShowShields(false)}>Return to page</button>}
            </div>
          </div>
        )}
        {(showHome || !hasPage) && !showShields && (
          <div className="absolute inset-0 overflow-auto">
            <div className="mx-auto max-w-4xl px-4 py-8 flex flex-col gap-8">
              <section>
                <div className="section-title">Play</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {HOME_SITES.map(site => (
                    <button
                      key={site.id}
                      type="button"
                      onClick={() => open(site.url)}
                      className={`glass rounded-2xl p-5 text-left flex flex-col gap-2 hover:border-white/25 transition-colors ${site.featured ? 'md:col-span-3 bg-purple-500/10' : ''}`}
                      data-testid={`site-${site.id}`}
                    >
                      <span className="flex items-center gap-2">
                        <Gamepad2 size={site.featured ? 22 : 16} className="text-purple-300" aria-hidden />
                        <span className={site.featured ? 'text-3xl leading-none font-heading' : 'text-base font-semibold'}>{site.title}</span>
                      </span>
                      <span className="text-xs text-slate-400">{site.subtitle}</span>
                      {site.featured && <span className="btn btn-primary btn-sm self-start mt-2">Play now</span>}
                    </button>
                  ))}
                </div>
                {hasPage && (
                  <button type="button" className="btn mt-4" onClick={() => setShowHome(false)}>
                    Resume {browserState?.title || browserState?.url}
                  </button>
                )}
              </section>

              <section className="glass rounded-2xl p-5 flex flex-col gap-3">
                <div className="section-title !mb-0">Link your Quai wallet</div>
                <ol className="text-sm text-slate-300 leading-relaxed list-decimal pl-5 flex flex-col gap-1">
                  <li>Unlock Bolt XR. Already use Pelagus? Restore its recovery phrase in Bolt XR and the same Quai address appears.</li>
                  <li>Open BEAM and press <strong>Connect</strong>. Bolt XR asks you to approve.</li>
                  <li>Press <strong>Verify</strong> on BEAM and sign the sign-in message. It proves you own the address; it moves no funds.</li>
                  <li>Clear the Keyforge Trial as a new pilot and claim your METAKEY — you confirm the claim in Bolt XR.</li>
                </ol>
                <p className="text-xs text-amber-300/90">
                  Bolt XR never asks for your recovery phrase or PIN inside a web page. Only enter them in Bolt XR&apos;s own
                  screens, which open with the page hidden. Esc always leaves a fullscreen game.
                </p>
                <p className="text-xs text-slate-400">
                  Account: {quai ? <span className="mono text-slate-200">{quai}</span> : 'unlock to show'} · Network: {network.shortName}
                </p>
              </section>

              <section className="flex flex-col gap-2">
                <div className="section-title">Connected sites</div>
                {connections.length === 0 && <p className="text-sm text-slate-500">No site can see your account yet.</p>}
                {connections.map(c => (
                  <div key={c.origin} className="card flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{KNOWN_ORIGINS[c.origin] ?? new URL(c.origin).host}</div>
                      <div className="mono text-[11px] text-slate-500 truncate">{c.origin}</div>
                    </div>
                    <button type="button" className="btn btn-sm" onClick={() => disconnect(c.origin)}>
                      <Unlink size={14} /> Disconnect
                    </button>
                  </div>
                ))}
              </section>
            </div>
          </div>
        )}
        {hasPage && !showHome && browserState?.loading && (
          <div className="absolute inset-x-0 top-0 h-0.5 bg-purple-500/70 animate-pulse" aria-hidden />
        )}
      </div>


      <VaultDialog open={vaultOpen} onClose={() => setVaultOpen(false)} />
    </div>
  );
}
