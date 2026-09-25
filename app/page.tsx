'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import LandingPage from '@/components/LandingPage';
import { useSettings } from '@/hooks/useSettings';

// Heavy, browser-only stacks (WebGL, MediaPipe) load on demand.
const StackLoading = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-[#020617]" role="status" aria-live="polite">
    <div className="flex flex-col items-center gap-4">
      <div className="h-10 w-10 rounded-full border-2 border-purple-500/30 border-t-purple-400 animate-spin" aria-hidden />
      <span className="mono text-[10px] uppercase tracking-[0.3em] text-slate-400">Initializing terminal…</span>
    </div>
  </div>
);

const WalletXR = dynamic(() => import('@/components/WalletXR'), { ssr: false, loading: StackLoading });
const HandTrackWallet = dynamic(() => import('@/components/HandTrackWallet'), { ssr: false, loading: StackLoading });

export default function Home() {
  const [isLanding, setIsLanding] = useState(true);
  const { activeStack, setActiveStack } = useSettings();

  if (isLanding) {
    return (
      <LandingPage
        lastStack={activeStack}
        onEnter={() => { setActiveStack('XR'); setIsLanding(false); }}
        onEnterHandtrack={() => { setActiveStack('2D'); setIsLanding(false); }}
      />
    );
  }

  return (
    <main>
      {activeStack === 'XR' ? (
        <WalletXR onExit={() => setIsLanding(true)} />
      ) : (
        <HandTrackWallet onExit={() => setIsLanding(true)} />
      )}
    </main>
  );
}
