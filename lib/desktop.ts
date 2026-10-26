/**
 * The desktop (Electron) bridge exposed by electron/preload.js. Undefined in
 * the web and headset builds, which have no game browser.
 */

export interface BrowserTab {
  id: number;
  url: string;
  title: string;
  loading: boolean;
}

export interface BrowserShields {
  trackers: boolean;
  thirdPartyCookies: boolean;
}

export interface BrowserStats {
  trackers: number;
  cookies: number;
  requests: number;
}

export interface BrowserCapture {
  dataUrl: string;
  width: number;
  height: number;
}

export interface BrowserState {
  tabId: number | null;
  tabs: BrowserTab[];
  shields: BrowserShields;
  stats: BrowserStats;
  url: string;
  origin: string | null;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  fullscreen: boolean;
  error?: string;
  failedUrl?: string;
}

export interface BrowserBounds { x: number; y: number; width: number; height: number }

export interface DappRequestMessage {
  id: number;
  origin: string;
  method: string;
  params: unknown[];
}

export type DappResponseMessage =
  | { result: unknown; error?: undefined }
  | { error: { code: number; message: string }; result?: undefined };

type Unsubscribe = () => void;

export interface BoltxrDesktop {
  platform: string;
  quaiRpcOverrides?: Partial<Record<'mainnet' | 'orchard', string>>;
  browser: {
    open(input: string, tabId?: number): Promise<{ ok: true; url: string; tabId: number } | { ok: false; reason: string }>;
    newTab(): Promise<number | null>;
    closeTab(id: number): void;
    activateTab(id: number): void;
    setShield(name: keyof BrowserShields, enabled: boolean): void;
    clearSiteData(): Promise<void>;
    capture(): Promise<BrowserCapture | null>;
    input(payload: { type: 'click' | 'scroll'; x: number; y: number; deltaY?: number }): void;
    layout(state: { visible: boolean; bounds: BrowserBounds }): void;
    command(name: 'back' | 'forward' | 'reload' | 'stop' | 'exit-fullscreen' | 'leave', tabId?: number): void;
    suspend(on: boolean): void;
    onState(cb: (state: BrowserState) => void): Unsubscribe;
    onFullscreen(cb: (payload: { on: boolean }) => void): Unsubscribe;
    onActivity(cb: () => void): Unsubscribe;
    onNotice(cb: (payload: { message: string }) => void): Unsubscribe;
  };
  dapp: {
    onRequest(cb: (request: DappRequestMessage) => void): Unsubscribe;
    onPageChanged(cb: () => void): Unsubscribe;
    respond(id: number, response: DappResponseMessage): void;
    emit(origin: string, event: string, data: unknown): void;
    setNetwork(network: { chainId: number; rpc: string }): void;
  };
}

export const getDesktop = (): BoltxrDesktop | null => {
  if (typeof window === 'undefined') return null;
  const bridge = (window as unknown as { boltxrDesktop?: BoltxrDesktop }).boltxrDesktop;
  return bridge && bridge.browser && bridge.dapp ? bridge : null;
};

/** Sites offered on the browser's home screen. */
export const HOME_SITES = [
  {
    id: 'overworld',
    title: 'Overworld Overdrive',
    subtitle: 'BOLTEVM MMORPG · play on BEAM',
    url: 'https://beam.boltevm.com/play/nft-1',
    featured: true,
  },
  {
    id: 'beam',
    title: 'BEAM',
    subtitle: 'Game store and launcher',
    url: 'https://beam.boltevm.com/',
    featured: false,
  },
  {
    id: 'beam-local',
    title: 'BEAM (local playtest)',
    subtitle: 'localhost:5280 · pnpm playtest:local',
    url: 'http://localhost:5280/',
    featured: false,
  },
] as const;

/**
 * Origins Bolt XR names on approval screens. Local addresses are never named:
 * any program on this machine could be listening there.
 */
export const KNOWN_ORIGINS: Record<string, string> = {
  'https://beam.boltevm.com': 'BEAM',
};
