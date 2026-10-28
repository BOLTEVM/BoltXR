'use client';

import { useState, useEffect, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { XR } from '@react-three/xr';
import { Settings, Gamepad2, Home, WalletCards, ArrowLeftRight, Sprout, ScanLine, Globe2 } from 'lucide-react';
import { ACESFilmicToneMapping } from 'three';
import { useSettings } from '@/hooks/useSettings';
import { initXrEmulation, shouldAttemptXrEmulation } from '@/lib/xr-emulation';
import '@/lib/xr-text';
import { xrStore, startSession } from '@/lib/xr/session';
import { guardXRFrames } from '@/lib/xr/frame-guard';
import Scene from './Scene';

type NavigatorWithXR = Navigator & {
    xr?: {
        isSessionSupported: (mode: 'immersive-vr' | 'immersive-ar') => Promise<boolean>;
    };
};

export default function WalletXR({ onExit, onOpenBrowser }: { onExit: () => void; onOpenBrowser?: () => void }) {
    const { setShowSettings } = useSettings();
    const [mounted, setMounted] = useState(false);
    const [xrSupport, setXrSupport] = useState<{ vr: boolean, ar: boolean }>({ vr: false, ar: false });
    const [emulationEnabled, setEmulationEnabled] = useState(false);
    const [contextLost, setContextLost] = useState(false);

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
            <div className="absolute top-4 right-4 z-10 glass p-4 rounded-2xl flex flex-col gap-4 w-[240px]">
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
                        onClick={() => startSession(xrSupport, 'passthrough')}
                        disabled={!xrSupport.ar}
                        title="See your room while you use the wallet (switch to a virtual sky from the watch at any time)"
                        className={`font-bold py-3 px-2 rounded-xl text-sm transition-all active:scale-95 flex-1 border border-white/10 ${
                            xrSupport.ar ? "bg-white/10 hover:bg-white/20 text-white" : "bg-white/5 text-gray-600 cursor-not-allowed"
                        }`}
                    >
                        {xrSupport.ar ? "Passthrough" : "Passthrough N/A"}
                    </button>
                    <button
                        onClick={() => startSession(xrSupport, 'vr')}
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
                {onOpenBrowser && (
                    <button
                        type="button"
                        onClick={onOpenBrowser}
                        className="btn btn-sm glass justify-center"
                    >
                        <Gamepad2 size={14} /> Play on BEAM
                    </button>
                )}
                {!xrSupport.vr && !xrSupport.ar && (
                    <p className="text-[10px] text-red-400 text-center font-medium">WebXR not supported on this device/browser.</p>
                )}
                {shouldAttemptXrEmulation() && (
                    <p className={`text-[10px] text-center font-bold uppercase tracking-widest ${emulationEnabled ? 'text-amber-300' : 'text-gray-500'}`}>
                        {emulationEnabled ? 'XR Emulation' : 'Native WebXR'}
                    </p>
                )}
            </div>

            {/* Keyboard-accessible desktop mirror of the same in-scene watch actions. */}
            <nav aria-label="Wrist OS shortcuts" className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 glass rounded-2xl p-1.5 flex gap-1">
                {([
                    ['home', 'Home', Home],
                    ['pay', 'Pay', WalletCards],
                    ['swap', 'Swap', ArrowLeftRight],
                    ['farm', 'Farm', Sprout],
                    ['scan', 'Scan', ScanLine],
                    ['web', 'Web', Globe2],
                ] as const).map(([view, label, Icon]) => (
                    <button
                        key={view}
                        type="button"
                        className="btn btn-sm btn-ghost px-3"
                        onClick={() => window.dispatchEvent(new CustomEvent('boltxr:watch-view', { detail: view }))}
                    >
                        <Icon size={14} aria-hidden /> {label}
                    </button>
                ))}
            </nav>

            {contextLost && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#020617]/90 p-4" role="alert">
                    <div className="glass rounded-2xl p-6 max-w-sm text-center flex flex-col gap-4">
                        <h2 className="text-2xl">3D view stopped</h2>
                        <p className="text-sm text-slate-400">
                            The graphics driver reset, so the 3D scene can&apos;t be drawn. Your vault is unaffected. Reload to continue, or switch to Hand Tracking in Settings.
                        </p>
                        <div className="flex gap-3 justify-center">
                            <button type="button" className="btn" onClick={() => setShowSettings(true)}>Settings</button>
                            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
                        </div>
                    </div>
                </div>
            )}

            <Canvas
                shadows
                dpr={[1, 1.5]}
                gl={{ antialias: true, powerPreference: 'high-performance' }}
                camera={{ position: [0, 1.6, 3], fov: 50, near: 0.03, far: 180 }}
                onCreated={({ gl }) => {
                    guardXRFrames();
                    gl.toneMapping = ACESFilmicToneMapping;
                    gl.toneMappingExposure = 1.08;
                    gl.domElement.addEventListener('webglcontextlost', (e) => {
                        e.preventDefault();
                        setContextLost(true);
                    });
                    gl.domElement.addEventListener('webglcontextrestored', () => setContextLost(false));
                }}
            >
                <XR store={xrStore}>
                    {/* Keep the DOM controls usable while 3D fonts/assets load. */}
                    <Suspense fallback={null}>
                        <Scene />
                    </Suspense>
                </XR>
            </Canvas>
        </div>
    );
}
