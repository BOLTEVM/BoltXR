'use client';

/**
 * Connects pages in the game browser to the wallet.
 *
 * Requests arrive from the desktop main process (already attributed to the
 * page's real origin), are answered by DappHost, and anything that needs the
 * person goes into an approval queue shown by <DappApprovalSheet>. While an
 * approval is on screen the page is hidden (browser.suspend).
 *
 * Events follow the account: when the vault locks, connected sites get
 * `accountsChanged([])`; when it unlocks they get the account back; a network
 * switch sends `chainChanged` to whatever page is open.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from './useWallet';
import { walletCore } from '@/lib/boltows/core-instance';
import { getQuaiNetwork, QUAI_CHAIN_KEYS, type QuaiNetwork, type QuaiNetworkKey } from '@/lib/boltows/quai';
import { DappError, DappHost, type Approval } from '@/lib/dapp/host';
import { getDesktop, type BrowserState } from '@/lib/desktop';

const NETWORK_STORE = 'bolt_quai_network';
const CONNECTIONS_STORE = 'bolt_dapp_connections_v1';
const MAX_QUEUED_APPROVALS = 8;
// A site that keeps asking after being rejected is ignored for a while, so it
// cannot trap the person in a loop of prompts.
const REJECTION_LIMIT = 3;
const REJECTION_WINDOW_MS = 60_000;
const COOLDOWN_MS = 60_000;

/** A site is connected to one account; a different account (e.g. a restored phrase) is not shared with it. */
export interface SiteConnection { origin: string; address: string; connectedAt: string }

interface QueuedApproval {
  key: number;
  approval: Approval;
  resolve: (approved: boolean) => void;
}

interface DappBridgeValue {
  /** True in the desktop app, where the game browser exists. */
  available: boolean;
  network: QuaiNetwork;
  setNetworkKey: (key: QuaiNetworkKey) => void;
  connections: SiteConnection[];
  disconnect: (origin: string) => void;
  /** The approval on screen, if any, and a key that changes with every new one. */
  approval: Approval | null;
  approvalKey: number;
  queued: number;
  resolveApproval: (approved: boolean) => void;
  browserState: BrowserState | null;
  notice: string | null;
  clearNotice: () => void;
}

const DappBridgeContext = createContext<DappBridgeValue | undefined>(undefined);

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
};

const readNetworkKey = (): QuaiNetworkKey => {
  try {
    return localStorage.getItem(NETWORK_STORE) === 'orchard' ? 'orchard' : 'mainnet';
  } catch {
    return 'mainnet';
  }
};

const readConnections = (): SiteConnection[] => {
  const raw = readJson<unknown>(CONNECTIONS_STORE, []);
  return Array.isArray(raw)
    ? raw.filter((c): c is SiteConnection => !!c && typeof c.origin === 'string' && typeof c.address === 'string' && typeof c.connectedAt === 'string')
    : [];
};

export const DappBridgeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const wallet = useWallet();
  const [desktop] = useState(getDesktop);
  const [networkKey, setNetworkKeyState] = useState<QuaiNetworkKey>(readNetworkKey);
  const [connections, setConnections] = useState<SiteConnection[]>(readConnections);
  const [queue, setQueue] = useState<QueuedApproval[]>([]);
  const [browserState, setBrowserState] = useState<BrowserState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const network = useMemo(() => getQuaiNetwork(networkKey), [networkKey]);
  const quaiAddress = wallet.status === 'unlocked' ? wallet.addresses.quai ?? null : null;

  // Latest values for the long-lived host.
  const live = useRef({ status: wallet.status, walletId: wallet.walletId, quaiAddress, network, connections });
  useEffect(() => {
    live.current = { status: wallet.status, walletId: wallet.walletId, quaiAddress, network, connections };
  });

  const queueRef = useRef<QueuedApproval[]>([]);
  const keyRef = useRef(0);
  const rejections = useRef(new Map<string, { times: number[]; until: number }>());
  const updateQueue = useCallback((next: QueuedApproval[]) => {
    queueRef.current = next;
    setQueue(next);
  }, []);

  const saveConnections = useCallback((next: SiteConnection[]) => {
    live.current.connections = next;
    setConnections(next);
    writeJson(CONNECTIONS_STORE, next);
  }, []);

  const setNetworkKey = useCallback((key: QuaiNetworkKey) => {
    setNetworkKeyState(key);
    live.current.network = getQuaiNetwork(key);
    try { localStorage.setItem(NETWORK_STORE, key); } catch { /* storage unavailable */ }
  }, []);

  const disconnect = useCallback((origin: string) => {
    saveConnections(live.current.connections.filter(c => c.origin !== origin));
    desktop?.dapp.emit(origin, 'accountsChanged', []);
  }, [desktop, saveConnections]);

  const resolveApproval = useCallback((approved: boolean) => {
    const [head, ...rest] = queueRef.current;
    if (!head) return;
    updateQueue(rest);
    if (!approved) {
      const origin = head.approval.origin;
      const now = Date.now();
      const entry = rejections.current.get(origin) ?? { times: [], until: 0 };
      entry.times = [...entry.times.filter(t => now - t < REJECTION_WINDOW_MS), now];
      if (entry.times.length >= REJECTION_LIMIT) {
        entry.until = now + COOLDOWN_MS;
        entry.times = [];
        setNotice(`Ignoring requests from ${new URL(origin).host} for a minute after repeated rejections.`);
      }
      rejections.current.set(origin, entry);
    }
    head.resolve(approved);
  }, [updateQueue]);

  // Requests from the page, and the page going away.
  useEffect(() => {
    if (!desktop) return;
    const host = new DappHost({
      state: () => ({ status: live.current.status, quaiAddress: live.current.quaiAddress }),
      network: () => live.current.network,
      // While locked the account is unknown; the host re-checks it after the approval unlocks.
      isConnected: origin => live.current.connections.some(c => c.origin === origin
        && (live.current.quaiAddress === null || c.address === live.current.quaiAddress)),
      connect: origin => {
        const address = live.current.quaiAddress;
        if (!address) return;
        const others = live.current.connections.filter(c => c.origin !== origin);
        saveConnections([...others, { origin, address, connectedAt: new Date().toISOString() }]);
      },
      disconnect: origin => disconnect(origin),
      approve: approval => new Promise<boolean>((resolve, reject) => {
        const cooldown = rejections.current.get(approval.origin);
        if (cooldown && cooldown.until > Date.now()) {
          reject(new DappError(4001, 'Bolt XR is ignoring requests from this site for a minute'));
          return;
        }
        if (queueRef.current.length >= MAX_QUEUED_APPROVALS) {
          reject(new DappError(-32002, 'Too many requests are waiting in Bolt XR'));
          return;
        }
        updateQueue([...queueRef.current, { key: ++keyRef.current, approval, resolve }]);
      }),
      signMessage: message => {
        const id = live.current.walletId;
        if (!id) throw new Error('Unlock Bolt XR first');
        return walletCore.signQuaiMessage(id, message);
      },
      signTypedData: typed => {
        const id = live.current.walletId;
        if (!id) throw new Error('Unlock Bolt XR first');
        return walletCore.signQuaiTypedData(id, typed);
      },
      sendTransaction: tx => {
        const id = live.current.walletId;
        if (!id) throw new Error('Unlock Bolt XR first');
        return walletCore.sendQuaiTransaction(id, QUAI_CHAIN_KEYS[live.current.network.key], {
          to: tx.to, value: tx.value, data: tx.data, gasLimit: tx.gasLimit,
        });
      },
      switchNetwork: key => setNetworkKey(key),
    });
    const offRequest = desktop.dapp.onRequest(request => {
      host.handle(request).then(response => desktop.dapp.respond(request.id, response));
    });
    const offPage = desktop.dapp.onPageChanged(() => {
      const pending = queueRef.current;
      updateQueue([]);
      pending.forEach(p => p.resolve(false));
    });
    const offState = desktop.browser.onState(setBrowserState);
    const offNotice = desktop.browser.onNotice(({ message }) => setNotice(message));
    // Playing in the browser keeps the vault's inactivity timer alive.
    const offActivity = desktop.browser.onActivity(() => walletCore.touch());
    return () => { offRequest(); offPage(); offState(); offNotice(); offActivity(); };
  }, [desktop, disconnect, saveConnections, setNetworkKey, updateQueue]);

  // Hide the page while the person is deciding.
  const approval = queue[0]?.approval ?? null;
  const approvalKey = queue[0]?.key ?? 0;
  useEffect(() => {
    desktop?.browser.suspend(approval !== null);
  }, [desktop, approval]);

  // Network: tell main (for read-only RPC) and the open page.
  const firstNetwork = useRef(true);
  useEffect(() => {
    if (!desktop) return;
    desktop.dapp.setNetwork({ chainId: network.chainId, rpc: network.rpc });
    if (firstNetwork.current) {
      firstNetwork.current = false;
      return;
    }
    desktop.dapp.emit('*', 'chainChanged', '0x' + network.chainId.toString(16));
  }, [desktop, network]);

  // Account: connected sites follow lock/unlock.
  const lastAccount = useRef<string | null>(null);
  useEffect(() => {
    if (!desktop || wallet.status === 'checking') return;
    if (lastAccount.current === quaiAddress) return;
    lastAccount.current = quaiAddress;
    for (const c of live.current.connections) {
      desktop.dapp.emit(c.origin, 'accountsChanged', quaiAddress && c.address === quaiAddress ? [quaiAddress] : []);
    }
  }, [desktop, wallet.status, quaiAddress]);

  const value: DappBridgeValue = {
    available: desktop !== null,
    network,
    setNetworkKey,
    connections,
    disconnect,
    approval,
    approvalKey,
    queued: Math.max(0, queue.length - 1),
    resolveApproval,
    browserState,
    notice,
    clearNotice: () => setNotice(null),
  };

  return <DappBridgeContext.Provider value={value}>{children}</DappBridgeContext.Provider>;
};

export function useDappBridge() {
  const context = useContext(DappBridgeContext);
  if (!context) throw new Error('useDappBridge must be used within a DappBridgeProvider');
  return context;
}
