'use client';

import { useState } from 'react';
import WalletXR from '@/components/WalletXR';
import HandTrackWallet from '@/components/HandTrackWallet';
import LandingPage from '@/components/LandingPage';
import { useSettings } from '@/hooks/useSettings';

export default function Home() {
  const [isLanding, setIsLanding] = useState(true);
  const { activeStack, setActiveStack } = useSettings();

  if (isLanding) {
    return (
      <LandingPage 
        onEnter={() => { setActiveStack('XR'); setIsLanding(false); }} 
        onEnterHandtrack={() => { setActiveStack('2D'); setIsLanding(false); }} 
      />
    );
  }

  return (
    <main className="min-h-screen">
      {activeStack === 'XR' ? (
        <WalletXR onExit={() => setIsLanding(true)} />
      ) : (
        <HandTrackWallet onExit={() => setIsLanding(true)} />
      )}
    </main>
  );
}
