'use client';

import { SettingsProvider } from '../hooks/useSettings';
import SettingsMenu from './SettingsMenu';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider>
      {children}
      <SettingsMenu />
    </SettingsProvider>
  );
}
