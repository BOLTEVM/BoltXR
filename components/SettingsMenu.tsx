'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettings } from '../hooks/useSettings';
import { Settings, Cpu, Layers, X, Info, Zap, Link } from 'lucide-react';
import { lovense } from '../lib/lovense';

const SettingsMenu: React.FC = () => {
  const { 
    showSettings, 
    setShowSettings, 
    activeStack, 
    setActiveStack, 
    modelComplexity, 
    setModelComplexity,
    hapticsEnabled,
    setHapticsEnabled,
    lovenseToken,
    setLovenseToken
  } = useSettings();

  if (!showSettings) return null;

  return (
    <AnimatePresence>
      <motion.div 
        className="settings-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div 
          className="settings-card"
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
        >
          <div className="settings-header">
            <div className="flex items-center gap-3">
              <Settings className="text-purple-400 h-5 w-5" />
              <span className="text-xl font-bold tracking-tight">SYSTEM CONFIG</span>
            </div>
            <button onClick={() => setShowSettings(false)} className="close-icon">
              <X size={20} />
            </button>
          </div>

          <div className="settings-body">
            {/* STACK SELECTION */}
            <div className="settings-section">
              <div className="section-title">
                <Layers size={14} className="mr-2" /> INTERFACE STACK
              </div>
              <div className="stack-options">
                <div 
                  className={`stack-btn ${activeStack === '2D' ? 'active' : ''}`}
                  onClick={() => setActiveStack('2D')}
                >
                  <div className="stack-label">2D WEB CAMERA</div>
                  <div className="stack-desc">MediaPipe Handtracking</div>
                </div>
                <div 
                  className={`stack-btn ${activeStack === 'XR' ? 'active' : ''}`}
                  onClick={() => setActiveStack('XR')}
                >
                  <div className="stack-label">LEGACY BOLTXR</div>
                  <div className="stack-desc">WebXR / Spatial 3D</div>
                </div>
              </div>
            </div>

            {/* PERFORMANCE */}
            <div className="settings-section">
              <div className="section-title">
                <Cpu size={14} className="mr-2" /> 2D PERFORMANCE
              </div>
              <div className="flex items-center justify-between p-4 glass rounded-xl border border-white/5">
                <div>
                  <div className="text-sm font-bold">Model Complexity</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">
                    Higher = Better precision, lower FPS
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    className={`toggle-tab ${modelComplexity === 0 ? 'active' : ''}`}
                    onClick={() => setModelComplexity(0)}
                  >
                    LITE
                  </button>
                  <button 
                    className={`toggle-tab ${modelComplexity === 1 ? 'active' : ''}`}
                    onClick={() => setModelComplexity(1)}
                  >
                    FULL
                  </button>
                </div>
              </div>
            </div>
            
            {/* HAPTICS */}
            <div className="settings-section">
              <div className="section-title">
                <Zap size={14} className="mr-2" /> HAPTIC STACK
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 glass rounded-xl border border-white/5">
                  <div>
                    <div className="text-sm font-bold">Haptic Feedback</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">
                      bHaptics & Lovense integration
                    </div>
                  </div>
                  <button 
                    className={`toggle-tab ${hapticsEnabled ? 'active' : ''}`}
                    onClick={() => setHapticsEnabled(!hapticsEnabled)}
                  >
                    {hapticsEnabled ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>

                <div className={`p-4 glass rounded-xl border border-white/5 transition-opacity ${!hapticsEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Link size={12} className="text-purple-400" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Lovense Token</span>
                    </div>
                    <div className={`status-pill ${lovense.getIsConnected() ? 'connected' : 'disconnected'}`}>
                      {lovense.getIsConnected() ? 'CONNECTED' : 'OFFLINE'}
                    </div>
                  </div>
                  <input 
                    type="password"
                    value={lovenseToken}
                    onChange={(e) => setLovenseToken(e.target.value)}
                    onBlur={() => lovense.setToken(lovenseToken)}
                    placeholder="Enter Developer Token..."
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono focus:border-purple-500/50 outline-none transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* INFO */}
            <div className="mt-6 p-4 rounded-xl bg-purple-500/5 border border-purple-500/20 flex gap-3">
              <Info className="text-purple-400 shrink-0" size={16} />
              <div className="text-[11px] leading-relaxed text-gray-400">
                Switching to **LEGACY BOLTXR** will attempt to initialize a WebXR session. Ensure your hardware is connected and WebXR is enabled in your browser flags.
              </div>
            </div>
          </div>

          <div className="settings-footer">
            BOLT XR LABS · v2.0.4-STABLE
          </div>
        </motion.div>

        <style jsx>{`
          .settings-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.8);
            backdrop-filter: blur(12px);
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .settings-card {
            width: 440px;
            background: rgba(15, 15, 20, 0.95);
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 40px 100px rgba(0,0,0,0.8), 0 0 40px rgba(168, 85, 247, 0.1);
            border-radius: 24px;
            overflow: hidden;
            color: white;
          }
          .settings-header {
            padding: 24px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .close-icon {
            color: rgba(255,255,255,0.4);
            transition: color 0.2s;
          }
          .close-icon:hover { color: white; }
          
          .settings-body { padding: 24px; }
          
          .settings-section { margin-bottom: 32px; }
          .section-title {
            display: flex;
            align-items: center;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.2em;
            color: rgba(255,255,255,0.3);
            margin-bottom: 16px;
            text-transform: uppercase;
          }

          .stack-options {
            display: grid;
            grid-template-cols: 1fr 1fr;
            gap: 12px;
          }
          .stack-btn {
            padding: 16px;
            border-radius: 16px;
            border: 1px solid rgba(255,255,255,0.05);
            background: rgba(255,255,255,0.02);
            cursor: pointer;
            transition: all 0.2s;
          }
          .stack-btn:hover {
            background: rgba(255,255,255,0.05);
            border-color: rgba(255,255,255,0.1);
          }
          .stack-btn.active {
            background: rgba(168, 85, 247, 0.1);
            border-color: rgba(168, 85, 247, 0.4);
            box-shadow: 0 0 20px rgba(168, 85, 247, 0.1);
          }
          .stack-label {
            font-weight: 800;
            font-size: 12px;
            margin-bottom: 4px;
          }
          .stack-desc {
            font-size: 9px;
            color: rgba(255,255,255,0.4);
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }

          .toggle-tab {
            padding: 8px 16px;
            font-size: 10px;
            font-weight: 800;
            border-radius: 8px;
            color: rgba(255,255,255,0.4);
            transition: all 0.2s;
          }
          .toggle-tab.active {
            background: white;
            color: black;
          }

          .settings-footer {
            padding: 16px 24px;
            background: rgba(0,0,0,0.3);
            font-size: 9px;
            letter-spacing: 0.3em;
            color: rgba(255,255,255,0.2);
            text-align: center;
          }

          .status-pill {
            font-size: 8px;
            font-weight: 800;
            padding: 2px 8px;
            border-radius: 4px;
            letter-spacing: 0.1em;
          }
          .status-pill.connected {
            background: rgba(34, 197, 94, 0.1);
            color: #22c55e;
            border: 1px solid rgba(34, 197, 94, 0.2);
          }
          .status-pill.disconnected {
            background: rgba(239, 68, 68, 0.1);
            color: #ef4444;
            border: 1px solid rgba(239, 68, 68, 0.2);
          }
        `}</style>
      </motion.div>
    </AnimatePresence>
  );
};

export default SettingsMenu;
