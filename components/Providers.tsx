'use client';

import { SettingsProvider } from '../hooks/useSettings';
import { WalletProvider } from '../hooks/useWallet';
import SettingsMenu from './SettingsMenu';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider>
      <WalletProvider>
        {children}
        <SettingsMenu />
      </WalletProvider>
    </SettingsProvider>
  );
}
