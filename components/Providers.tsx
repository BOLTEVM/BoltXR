'use client';

import { SettingsProvider } from '../hooks/useSettings';
import { WalletProvider } from '../hooks/useWallet';
import { WatchOwnershipProvider } from '../hooks/useWatchOwnership';
import SettingsMenu from './SettingsMenu';
import { DappBridgeProvider } from '../hooks/useDappBridge';
import DappApprovalSheet from './browser/DappApprovalSheet';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider>
      <WalletProvider>
        <WatchOwnershipProvider>
          <DappBridgeProvider>
            {children}
            <SettingsMenu />
            <DappApprovalSheet />
          </DappBridgeProvider>
        </WatchOwnershipProvider>
      </WalletProvider>
    </SettingsProvider>
  );
}
