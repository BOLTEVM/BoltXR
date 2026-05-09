'use client';

import { motion } from 'framer-motion';
import { Box, Shield, Zap, Globe, ArrowRight, Download } from 'lucide-react';

interface LandingPageProps {
  onEnter: () => void;
  onEnterHandtrack: () => void;
}

export default function LandingPage({ onEnter, onEnterHandtrack }: LandingPageProps) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#020617] text-white flex flex-col">
      {/* Background Glows */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] left-[-5%] h-[40%] w-[40%] rounded-full bg-purple-900/15 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] h-[40%] w-[40%] rounded-full bg-blue-900/15 blur-[120px]" />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <img src="/0logov3.png" alt="BOLT Logo" className="h-8 w-8 object-contain" />
          <span className="text-xl font-bold tracking-tight">BOLT <span className="text-purple-500">XR</span></span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-xs font-semibold uppercase tracking-widest text-gray-500">
          <a href="#" className="hover:text-white transition-colors">Platform</a>
          <a href="#" className="hover:text-white transition-colors">Security</a>
          <a href="#" className="hover:text-white transition-colors">Networks</a>
          <a href="#" className="hover:text-white transition-colors">Docs</a>
        </div>
        <button 
          onClick={onEnter}
          className="glass px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95"
        >
          Launch Terminal
        </button>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 mx-auto max-w-7xl px-8 flex-1 flex flex-col justify-center py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 text-[11px] font-bold tracking-[0.25em] uppercase mb-10 shadow-lg shadow-purple-500/10">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
              </span>
              Spatial Computing v1.0
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-7xl font-black leading-[1.1] mb-8 tracking-tighter uppercase font-heading">
              Master Your <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-500">Economy</span> in XR.
            </h1>
            <p className="text-base text-gray-400 mb-12 max-w-md leading-relaxed">
              Experience the next generation of decentralized finance. Bolt XR allows you to manage multi-chain assets with handtracking precision in a fully immersive spatial environment.
            </p>
            <div className="flex flex-wrap gap-4">
              <button 
                onClick={onEnter}
                className="px-10 py-5 rounded-2xl bg-white text-[#020617] font-bold flex items-center gap-3 hover:bg-gray-100 transition-all active:scale-95 shadow-xl"
              >
                ENTER VR EXPERIENCE <ArrowRight className="h-5 w-5" />
              </button>
              <button 
                onClick={() => window.open('https://github.com/BOLTEVM/BoltXR/releases/latest', '_blank')}
                className="px-8 py-5 rounded-2xl glass font-bold flex items-center gap-3 hover:bg-white/10 transition-all active:scale-95 text-gray-200"
              >
                <Download className="h-5 w-5" /> DOWNLOAD CLIENT
              </button>
            </div>
          </motion.div>

          {/* Hero Visual */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="relative"
          >
            <div className="relative aspect-square w-full max-w-[460px] mx-auto lg:ml-auto">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-[48px] blur-3xl animate-pulse" />
              <div className="glass h-full w-full rounded-[48px] overflow-hidden border border-white/10 relative z-10 shadow-2xl">
                <img 
                  src="/xr_wallet_hero_1777513978811.png" 
                  alt="XR Wallet" 
                  className="h-full w-full object-cover"
                />
              </div>
              
              {/* Floating Status Cards */}
              <motion.div 
                animate={{ y: [0, -12, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -top-6 -right-6 glass px-6 py-4 rounded-3xl z-20 border border-white/15 shadow-2xl min-w-[160px]"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-2xl bg-purple-500/20 flex items-center justify-center">
                    <Shield className="h-5 w-5 text-purple-400" />
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
                className="absolute -bottom-8 -left-6 glass px-6 py-5 rounded-3xl z-20 border border-white/15 shadow-2xl min-w-[180px]"
              >
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-blue-500/20 flex items-center justify-center">
                    <Globe className="h-6 w-6 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-0.5">Connectivity</div>
                    <div className="text-[15px] font-bold">Multi-Chain Sync</div>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Feature Grid */}
      <section className="relative z-10 px-8 pb-16">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            <div className="glass p-8 rounded-[32px] border border-white/5 hover:border-white/20 transition-all group">
              <Box className="h-8 w-8 text-purple-500 mb-6 group-hover:scale-110 transition-transform" />
              <h3 className="text-xl font-bold mb-3">Multi-Chain Vault</h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Manage Ethereum, Bitcoin, Solana, and more from a single secure spatial environment.
              </p>
            </div>
            <div className="glass p-8 rounded-[32px] border border-white/5 hover:border-white/20 transition-all group">
              <Zap className="h-8 w-8 text-blue-500 mb-6 group-hover:scale-110 transition-transform" />
              <h3 className="text-xl font-bold mb-3">Instant Sync</h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Real-time balance synchronization using ultra-low latency nodes for precise spatial data.
              </p>
            </div>
            <div className="glass p-8 rounded-[32px] border border-white/5 hover:border-white/20 transition-all group">
              <Shield className="h-8 w-8 text-emerald-500 mb-6 group-hover:scale-110 transition-transform" />
              <h3 className="text-xl font-bold mb-3">Biometric Link</h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Future-ready handtracking and eye-tracking authentication protocols for ultimate security.
              </p>
            </div>
          </div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="relative z-10 px-8 py-10 border-t border-white/5 text-center text-gray-600 text-[10px] font-bold uppercase tracking-[0.3em]">
        <p>&copy; 2026 BOLT XR LABS. All Rights Reserved.</p>
      </footer>
    </div>
  );
}
