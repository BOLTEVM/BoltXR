'use client';

import React, { createContext, useCallback, useContext, useState, useSyncExternalStore, ReactNode } from 'react';

export type AppStack = '2D' | 'XR';

interface PersistedSettings {
  activeStack: AppStack;
  modelComplexity: 0 | 1;
  hapticsEnabled: boolean;
  lovenseToken: string;
}

interface SettingsContextType extends PersistedSettings {
  setActiveStack: (stack: AppStack) => void;
  setModelComplexity: (val: 0 | 1) => void;
  showSettings: boolean;
  setShowSettings: (val: boolean) => void;
  setHapticsEnabled: (val: boolean) => void;
  setLovenseToken: (val: string) => void;
}

const DEFAULTS: PersistedSettings = {
  activeStack: 'XR',
  modelComplexity: 1,
  hapticsEnabled: false,
  lovenseToken: '',
};

// Storage keys are kept from earlier releases so existing preferences survive.
const KEYS: Record<keyof PersistedSettings, string> = {
  activeStack: 'bolt_active_stack',
  modelComplexity: 'bolt_model_complexity',
  hapticsEnabled: 'HAPTICS_ENABLED',
  lovenseToken: 'LOVENSE_TOKEN',
};

const safeGet = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};

const safeSet = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable (private mode) */ }
};

const readSettings = (): PersistedSettings => {
  const stack = safeGet(KEYS.activeStack);
  const complexity = safeGet(KEYS.modelComplexity);
  const haptics = safeGet(KEYS.hapticsEnabled);
  return {
    activeStack: stack === '2D' || stack === 'XR' ? stack : DEFAULTS.activeStack,
    modelComplexity: complexity === '0' ? 0 : complexity === '1' ? 1 : DEFAULTS.modelComplexity,
    hapticsEnabled: haptics === null ? DEFAULTS.hapticsEnabled : haptics === 'true',
    lovenseToken: safeGet(KEYS.lovenseToken) ?? DEFAULTS.lovenseToken,
  };
};

// A tiny external store so every consumer (and other tabs) stay in sync.
let snapshot: PersistedSettings | null = null;
const listeners = new Set<() => void>();

const getSnapshot = () => {
  if (!snapshot) snapshot = readSettings();
  return snapshot;
};
const getServerSnapshot = () => DEFAULTS;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key && Object.values(KEYS).includes(e.key)) {
      snapshot = readSettings();
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
};

const update = <K extends keyof PersistedSettings>(key: K, value: PersistedSettings[K]) => {
  snapshot = { ...getSnapshot(), [key]: value };
  safeSet(KEYS[key], String(value));
  listeners.forEach(l => l());
};

/** Read a persisted setting outside React (e.g. per-frame gesture code). */
export const getSetting = <K extends keyof PersistedSettings>(key: K): PersistedSettings[K] =>
  typeof window === 'undefined' ? DEFAULTS[key] : getSnapshot()[key];

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [showSettings, setShowSettings] = useState(false);

  const setActiveStack = useCallback((stack: AppStack) => update('activeStack', stack), []);
  const setModelComplexity = useCallback((val: 0 | 1) => update('modelComplexity', val), []);
  const setHapticsEnabled = useCallback((val: boolean) => update('hapticsEnabled', val), []);
  const setLovenseToken = useCallback((val: string) => update('lovenseToken', val), []);

  return (
    <SettingsContext.Provider value={{
      ...settings,
      setActiveStack,
      setModelComplexity,
      showSettings,
      setShowSettings,
      setHapticsEnabled,
      setLovenseToken,
    }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within a SettingsProvider');
  return context;
};
