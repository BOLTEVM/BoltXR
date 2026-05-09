'use client';

import { useState } from 'react';
import WalletXR from '@/components/WalletXR';
import HandTrackWallet from '@/components/HandTrackWallet';
import LandingPage from '@/components/LandingPage';

export default function Home() {
  const [mode, setMode] = useState<'landing' | 'xr' | 'handtrack'>('landing');

  if (mode === 'landing') {
    return (
      <LandingPage 
        onEnter={() => setMode('xr')} 
        onEnterHandtrack={() => setMode('handtrack')} 
      />
    );
  }

  return (
    <main className="min-h-screen">
      {mode === 'xr' ? (
        <WalletXR onExit={() => setMode('landing')} />
      ) : (
        <HandTrackWallet onExit={() => setMode('landing')} />
      )}
    </main>
  );
}
