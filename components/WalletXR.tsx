'use client';

import { useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { XR, createXRStore } from '@react-three/xr';
import { Settings } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { initXrEmulation, shouldAttemptXrEmulation } from '@/lib/xr-emulation';
import Scene from './Scene';

const store = createXRStore();

type NavigatorWithXR = Navigator & {
    xr?: {
        isSessionSupported: (mode: 'immersive-vr' | 'immersive-ar') => Promise<boolean>;
    };
};

export default function WalletXR({ onExit }: { onExit: () => void }) {
    const { setShowSettings } = useSettings();
    const [mounted, setMounted] = useState(false);
    const [xrSupport, setXrSupport] = useState<{ vr: boolean, ar: boolean }>({ vr: false, ar: false });
    const [emulationEnabled, setEmulationEnabled] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const initialize = async () => {
            const emulation = await initXrEmulation();

            if (cancelled) return;
            setEmulationEnabled(emulation.enabled);

            // Check WebXR support after optional dev-only emulation is installed.
            const xr = typeof navigator !== 'undefined'
                ? (navigator as NavigatorWithXR).xr
                : undefined;

            if (xr) {
                const [vr, ar] = await Promise.all([
                    xr.isSessionSupported('immersive-vr'),
                    xr.isSessionSupported('immersive-ar')
                ]);

                if (!cancelled) {
                    setXrSupport({ vr, ar });
                }
            }

            if (!cancelled) {
                setMounted(true);
            }
        };

        initialize().catch((error) => {
            console.warn('XR emulation initialization failed:', error);
            if (!cancelled) {
                setMounted(true);
            }
        });

        return () => {
            cancelled = true;
        };
    }, []);

    if (!mounted) return null;

    return (
        <div className="h-screen w-screen bg-black relative">
            {/* Minimal Overlay for Control */}
            <div className="absolute top-6 left-6 z-10 glass p-6 rounded-2xl flex flex-col gap-6 max-w-[280px]">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-black text-white tracking-tighter">BOLT XR</h1>
                        <p className="text-[10px] text-purple-400 uppercase tracking-widest font-bold">Spatial Finance</p>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setShowSettings(true)}
                            className="text-gray-500 hover:text-white bg-white/5 p-2 rounded-lg transition-colors"
                        >
                            <Settings size={14} />
                        </button>
                        <button 
                            onClick={onExit}
                            className="text-[10px] text-gray-500 hover:text-white uppercase tracking-widest font-bold bg-white/5 p-2 rounded-lg transition-colors"
                        >
                            Exit
                        </button>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={() => store.enterAR()}
                        disabled={!xrSupport.ar}
                        className={`font-bold py-3 px-4 rounded-xl text-sm transition-all active:scale-95 flex-1 border border-white/10 ${
                            xrSupport.ar ? "bg-white/10 hover:bg-white/20 text-white" : "bg-white/5 text-gray-600 cursor-not-allowed"
                        }`}
                    >
                        {xrSupport.ar ? "AR" : "AR N/A"}
                    </button>
                    <button
                        onClick={() => store.enterVR()}
                        disabled={!xrSupport.vr}
                        className={`font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-lg active:scale-95 flex-1 ${
                            xrSupport.vr 
                                ? "bg-purple-600 hover:bg-purple-700 text-white shadow-purple-500/20" 
                                : "bg-purple-900/20 text-gray-600 cursor-not-allowed"
                        }`}
                    >
                        {xrSupport.vr ? "VR" : "VR N/A"}
                    </button>
                </div>
                {!xrSupport.vr && !xrSupport.ar && (
                    <p className="text-[10px] text-red-400 text-center font-medium">WebXR not supported on this device/browser.</p>
                )}
                {shouldAttemptXrEmulation() && (
                    <p className={`text-[10px] text-center font-bold uppercase tracking-widest ${emulationEnabled ? 'text-amber-300' : 'text-gray-500'}`}>
                        {emulationEnabled ? 'XR Emulation' : 'Native WebXR'}
                    </p>
                )}
            </div>

            <Canvas shadows camera={{ position: [0, 1.6, 3], fov: 50 }}>
                <XR store={store}>
                    <Scene />
                </XR>
            </Canvas>
        </div>
    );
}
