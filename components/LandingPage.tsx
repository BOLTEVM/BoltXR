'use client';

import { motion } from 'framer-motion';
import { Box, Shield, Zap, Globe, ArrowRight, Download } from 'lucide-react';
import Image from 'next/image';

interface LandingPageProps {
  onEnter: () => void;
}

export default function LandingPage({ onEnter }: LandingPageProps) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#020617] text-white">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] left-[-10%] h-[40%] w-[40%] rounded-full bg-purple-900/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-blue-900/20 blur-[120px]" />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-3">
          <img src="/0logov3.png" alt="BOLT Logo" className="h-10 w-10 object-contain" />
          <span className="text-2xl font-black tracking-tighter">BOLT <span className="text-purple-500">XR</span></span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-400">
          <a href="#" className="hover:text-white transition-colors">Platform</a>
          <a href="#" className="hover:text-white transition-colors">Security</a>
          <a href="#" className="hover:text-white transition-colors">Networks</a>
          <a href="#" className="hover:text-white transition-colors">Docs</a>
        </div>
        <button 
          onClick={onEnter}
          className="glass px-5 py-2 rounded-full text-sm font-semibold hover:bg-white/10 transition-all active:scale-95"
        >
          Launch App
        </button>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 mx-auto max-w-7xl px-8 pt-20 pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-bold tracking-widest uppercase mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
              </span>
              Spatial Computing v1.0
            </div>
            <h1 className="text-6xl md:text-8xl font-black leading-[1] mb-8 bg-gradient-to-r from-white via-white to-gray-600 bg-clip-text text-transparent tracking-tighter">
              Master Your <br />
              <span className="text-purple-500">Economy</span> in XR.
            </h1>
            <p className="text-lg text-gray-400 mb-10 max-w-lg leading-relaxed">
              Experience the next generation of decentralized finance. Bolt XR allows you to manage multi-chain assets with handtracking precision in a fully immersive spatial environment.
            </p>
            <div className="flex flex-wrap gap-4">
              <button 
                onClick={onEnter}
                className="px-8 py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold flex items-center gap-2 hover:shadow-[0_0_30px_rgba(147,51,234,0.3)] transition-all active:scale-95"
              >
                ENTER VR EXPERIENCE <ArrowRight className="h-5 w-5" />
              </button>
              <button 
                onClick={() => window.open('https://github.com/BOLTEVM/BoltXR/releases/latest', '_blank')}
                className="px-8 py-4 rounded-2xl glass font-bold flex items-center gap-2 hover:bg-white/10 transition-all active:scale-95 text-gray-300"
              >
                <Download className="h-5 w-5" /> DOWNLOAD WINDOWS (.EXE)
              </button>
            </div>
          </motion.div>

          {/* Hero Image / Visual */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="relative"
          >
            <div className="relative aspect-square w-full max-w-[500px] mx-auto">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/30 to-blue-500/30 rounded-3xl blur-3xl animate-pulse" />
              <div className="glass h-full w-full rounded-[40px] overflow-hidden border border-white/20 relative z-10">
                <img 
                  src="/xr_wallet_hero_1777513978811.png" 
                  alt="XR Wallet Visualization" 
                  className="h-full w-full object-cover"
                />
              </div>
              
              {/* Floating Cards */}
              <motion.div 
                animate={{ y: [0, -20, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -top-6 -right-6 glass p-4 rounded-2xl z-20 border border-white/10 shadow-2xl"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                    <Shield className="h-6 w-6 text-purple-400" />
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Security</div>
                    <div className="text-sm font-bold">Local Encryption</div>
                  </div>
                </div>
              </motion.div>

              <motion.div 
                animate={{ y: [0, 20, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                className="absolute -bottom-10 -left-10 glass p-6 rounded-3xl z-20 border border-white/10 shadow-2xl"
              >
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-blue-500/20 flex items-center justify-center">
                    <Globe className="h-7 w-7 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Connectivity</div>
                    <div className="text-lg font-bold">12+ Chains</div>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Feature Grid */}
      <section className="relative z-10 px-8 pb-32">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="glass p-8 rounded-[32px] border border-white/10">
              <Box className="h-10 w-10 text-purple-500 mb-6" />
              <h3 className="text-xl font-bold mb-3">Multi-Chain Vault</h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Manage Ethereum, Bitcoin, Solana, and more from a single secure spatial environment.
              </p>
            </div>
            <div className="glass p-8 rounded-[32px] border border-white/10">
              <Zap className="h-10 w-10 text-blue-500 mb-6" />
              <h3 className="text-xl font-bold mb-3">Instant Sync</h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Real-time balance synchronization using ultra-low latency nodes for precise spatial data.
              </p>
            </div>
            <div className="glass p-8 rounded-[32px] border border-white/10">
              <Shield className="h-10 w-10 text-emerald-500 mb-6" />
              <h3 className="text-xl font-bold mb-3">Biometric Link</h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Future-ready handtracking and eye-tracking authentication protocols for ultimate security.
              </p>
            </div>
          </div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="relative z-10 px-8 py-12 border-t border-white/5 text-center text-gray-500 text-sm">
        <p>&copy; 2026 BOLT XR LABS. All Rights Reserved. Built for Spatial Computing.</p>
      </footer>
    </div>
  );
}
