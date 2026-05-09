'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type AppStack = '2D' | 'XR';

interface SettingsContextType {
  activeStack: AppStack;
  setActiveStack: (stack: AppStack) => void;
  modelComplexity: 0 | 1;
  setModelComplexity: (val: 0 | 1) => void;
  showSettings: boolean;
  setShowSettings: (val: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeStack, setActiveStack] = useState<AppStack>('2D');
  const [modelComplexity, setModelComplexity] = useState<0 | 1>(1);
  const [showSettings, setShowSettings] = useState(false);

  // Load from localStorage
  useEffect(() => {
    const savedStack = localStorage.getItem('bolt_active_stack') as AppStack;
    const savedComplexity = localStorage.getItem('bolt_model_complexity');
    
    if (savedStack) setActiveStack(savedStack);
    if (savedComplexity) setModelComplexity(Number(savedComplexity) as 0 | 1);
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('bolt_active_stack', activeStack);
    localStorage.setItem('bolt_model_complexity', String(modelComplexity));
  }, [activeStack, modelComplexity]);

  return (
    <SettingsContext.Provider value={{
      activeStack,
      setActiveStack,
      modelComplexity,
      setModelComplexity,
      showSettings,
      setShowSettings
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
