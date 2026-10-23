'use client';

import { SettingsProvider } from '../hooks/useSettings';
import { WalletProvider } from '../hooks/useWallet';
import SettingsMenu from './SettingsMenu';
import { DappBridgeProvider } from '../hooks/useDappBridge';
import DappApprovalSheet from './browser/DappApprovalSheet';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider>
      <WalletProvider>
        <DappBridgeProvider>
          {children}
          <SettingsMenu />
          <DappApprovalSheet />
        </DappBridgeProvider>
      </WalletProvider>
    </SettingsProvider>
  );
}
