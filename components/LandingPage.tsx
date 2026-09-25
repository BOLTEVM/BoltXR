'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { Box, Shield, Hand, Globe, ArrowRight, Download, Lock, Timer, KeyRound, Github } from 'lucide-react';
import { CHAINS, SELECTED_CHAINS } from '@/lib/boltows/chains';
import { APP_VERSION, RELEASES_URL, REPO_URL } from '@/lib/app-info';
import type { AppStack } from '@/hooks/useSettings';

interface LandingPageProps {
  onEnter: () => void;
  onEnterHandtrack: () => void;
  lastStack?: AppStack;
}

const FEATURES = [
  {
    icon: Box,
    tint: 'text-purple-400',
    title: 'Multi-Chain Vault',
    body: 'Ethereum, BNB Chain, Polygon, Monad, Bitcoin, Sui and Tron — one recovery phrase, standard derivation paths.',
  },
  {
    icon: Hand,
    tint: 'text-cyan-400',
    title: 'Hand-Tracking Controls',
    body: 'Pinch to tap, drag and resize floating controls with your webcam, or use native hand input in a WebXR headset.',
  },
  {
    icon: Shield,
    tint: 'text-emerald-400',
    title: 'Encrypted On-Device',
    body: 'Keys never leave your device. The vault is AES-256-GCM encrypted and locks itself when you step away.',
  },
];

const SECURITY_POINTS = [
  { icon: KeyRound, title: 'PBKDF2 · 600k iterations', body: 'Your PIN is stretched before it ever touches the vault key.' },
  { icon: Timer, title: 'Auto-lock', body: 'The session locks after 15 minutes without activity.' },
  { icon: Lock, title: 'Brute-force lockout', body: 'Repeated wrong PINs trigger an escalating cooldown that survives reloads.' },
];

export default function LandingPage({ onEnter, onEnterHandtrack, lastStack }: LandingPageProps) {
  const launchLast = lastStack === '2D' ? onEnterHandtrack : onEnter;

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#020617] text-white flex flex-col">
      {/* Background Glows */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
        <div className="absolute top-[-10%] left-[-5%] h-[40%] w-[40%] rounded-full bg-purple-900/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] h-[40%] w-[40%] rounded-full bg-blue-900/20 blur-[120px]" />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between gap-4 px-4 sm:px-8 py-5 max-w-7xl mx-auto w-full">
        <a href="#top" className="flex items-center gap-3" aria-label="BOLT XR home">
          <Image src="/0logov3.png" alt="" width={32} height={32} className="h-8 w-8 object-contain" priority />
          <span className="text-xl font-bold tracking-tight">BOLT <span className="text-purple-500">XR</span></span>
        </a>
        <div className="hidden md:flex items-center gap-8 text-xs font-semibold uppercase tracking-widest text-gray-400">
          <a href="#features" className="hover:text-white transition-colors">Platform</a>
          <a href="#security" className="hover:text-white transition-colors">Security</a>
          <a href="#networks" className="hover:text-white transition-colors">Networks</a>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Docs</a>
        </div>
        <button onClick={launchLast} className="btn btn-sm glass rounded-full px-5">
          Launch Terminal
        </button>
      </nav>

      {/* Hero Section */}
      <main id="top" className="relative z-10 mx-auto max-w-7xl w-full px-4 sm:px-8 flex-1 flex flex-col justify-center py-10 lg:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-[11px] font-bold tracking-[0.25em] uppercase mb-8 shadow-lg shadow-purple-500/10">
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
              </span>
              Spatial Wallet · v{APP_VERSION}
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-8xl leading-[0.95] mb-6 uppercase font-heading">
              Master Your <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-500">Economy</span> in XR.
            </h1>
            <p className="text-base text-gray-400 mb-10 max-w-md leading-relaxed">
              A multi-chain wallet built for spatial computing. Manage assets in an immersive WebXR scene or drive it hands-free with webcam hand tracking.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
              <button onClick={onEnter} className="btn btn-lg btn-light justify-between text-left">
                <span className="flex flex-col items-start gap-0.5">
                  <span>Enter Spatial XR</span>
                  <span className="text-[10px] font-semibold tracking-wider text-slate-500 normal-case">WebXR · VR / AR / desktop 3D</span>
                </span>
                <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
              </button>
              <button onClick={onEnterHandtrack} className="btn btn-lg glass justify-between text-left">
                <span className="flex flex-col items-start gap-0.5">
                  <span>Hand Tracking</span>
                  <span className="text-[10px] font-semibold tracking-wider text-slate-400 normal-case">Webcam · pinch gestures</span>
                </span>
                <Hand className="h-5 w-5 shrink-0 text-cyan-400" aria-hidden />
              </button>
            </div>
            <a
              href={RELEASES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-white transition-colors"
            >
              <Download className="h-4 w-4" aria-hidden /> Download desktop client
            </a>
          </motion.div>

          {/* Hero Visual */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="relative px-4 sm:px-8 lg:px-0"
          >
            <div className="relative aspect-square w-full max-w-[460px] mx-auto lg:ml-auto">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-[48px] blur-3xl animate-pulse" aria-hidden />
              <div className="glass h-full w-full rounded-[40px] sm:rounded-[48px] overflow-hidden relative z-10 shadow-2xl">
                <Image
                  src="/xr-wallet-hero.webp"
                  alt="Floating holographic wallet surrounded by orbiting crypto tokens"
                  width={920}
                  height={920}
                  priority
                  className="h-full w-full object-cover"
                />
              </div>

              {/* Floating Status Cards */}
              <motion.div
                animate={{ y: [0, -12, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -top-5 right-0 sm:-right-6 glass px-4 sm:px-6 py-3 sm:py-4 rounded-3xl z-20 border border-white/15 shadow-2xl"
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="h-10 w-10 rounded-2xl bg-purple-500/20 flex items-center justify-center">
                    <Shield className="h-5 w-5 text-purple-400" aria-hidden />
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-0.5">Security</div>
                    <div className="text-[13px] font-bold">Encrypted Keys</div>
                  </div>
                </div>
              </motion.div>

              <motion.div
                animate={{ y: [0, 12, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                className="absolute -bottom-6 left-0 sm:-left-6 glass px-4 sm:px-6 py-3 sm:py-5 rounded-3xl z-20 border border-white/15 shadow-2xl"
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl bg-blue-500/20 flex items-center justify-center">
                    <Globe className="h-5 w-5 sm:h-6 sm:w-6 text-blue-400" aria-hidden />
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-0.5">Connectivity</div>
                    <div className="text-[13px] sm:text-[15px] font-bold">Multi-Chain Sync</div>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Feature Grid */}
      <section id="features" className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-8 pt-16 pb-12 scroll-mt-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-8">
          {FEATURES.map(({ icon: Icon, tint, title, body }) => (
            <div key={title} className="glass p-7 rounded-[28px] hover:border-white/20 transition-colors group">
              <Icon className={`h-8 w-8 ${tint} mb-5 group-hover:scale-110 transition-transform`} aria-hidden />
              <h3 className="text-2xl mb-2">{title}</h3>
              <p className="text-gray-400 leading-relaxed text-sm">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Security */}
      <section id="security" className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-8 py-12 scroll-mt-8">
        <div className="glass rounded-[28px] p-7 sm:p-10 grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-8 items-start">
          <div>
            <div className="section-title">Security model</div>
            <h2 className="text-4xl leading-none mb-3">Your keys stay yours.</h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              Bolt XR is self-custodial. Nothing is sent to a server; balances and quotes come straight from public RPC and aggregator APIs.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {SECURITY_POINTS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="card p-5">
                <Icon className="h-5 w-5 text-purple-400 mb-3" aria-hidden />
                <div className="text-sm font-bold mb-1">{title}</div>
                <p className="text-xs text-gray-400 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Networks */}
      <section id="networks" className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-8 pt-12 pb-20 scroll-mt-8">
        <div>
          <div className="section-title">Supported networks</div>
          <div className="flex flex-wrap gap-3">
            {SELECTED_CHAINS.map(key => {
              const chain = CHAINS[key];
              const capability = chain.canSwap ? 'Send · Swap' : chain.canSend ? 'Send' : 'View';
              return (
                <div key={key} className="card flex items-center gap-3 px-4 py-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: chain.color }} aria-hidden />
                  <span className="text-sm font-bold">{chain.name}</span>
                  <span className="mono text-[10px] text-gray-400">{chain.nativeCurrency.symbol}</span>
                  <span className={`pill ${chain.canSend ? 'pill-success' : ''}`}>{capability}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-8 border-t border-white/5 text-gray-500 text-[10px] font-bold uppercase tracking-[0.3em]">
        <div className="mx-auto max-w-7xl px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>&copy; {new Date().getFullYear()} BOLT XR LABS · v{APP_VERSION}</p>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-white transition-colors">
            <Github className="h-4 w-4" aria-hidden /> Source
          </a>
        </div>
      </footer>
    </div>
  );
}
