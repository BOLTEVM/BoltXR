'use client';

import { useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { XR, createXRStore } from '@react-three/xr';
import Scene from './Scene';
import LandingPage from './LandingPage';

const store = createXRStore();

export default function WalletXR() {
    const [mounted, setMounted] = useState(false);
    const [showLanding, setShowLanding] = useState(true);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    if (showLanding) {
        return <LandingPage onEnter={() => setShowLanding(false)} />;
    }

    return (
        <div className="h-screen w-screen bg-black relative">
            {/* Minimal Overlay for Control */}
            <div className="absolute top-6 left-6 z-10 glass p-6 rounded-2xl flex flex-col gap-6 max-w-[280px]">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-black text-white tracking-tighter">BOLT XR</h1>
                        <p className="text-[10px] text-purple-400 uppercase tracking-widest font-bold">Spatial Finance</p>
                    </div>
                    <button 
                        onClick={() => setShowLanding(true)}
                        className="text-[10px] text-gray-500 hover:text-white uppercase tracking-widest font-bold bg-white/5 p-2 rounded-lg transition-colors"
                    >
                        Exit
                    </button>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={() => store.enterAR()}
                        className="bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all active:scale-95 flex-1 border border-white/10"
                    >
                        AR
                    </button>
                    <button
                        onClick={() => store.enterVR()}
                        className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-lg shadow-purple-500/20 active:scale-95 flex-1"
                    >
                        VR
                    </button>
                </div>
            </div>

            <Canvas shadows camera={{ position: [0, 1.6, 3], fov: 50 }}>
                <XR store={store}>
                    <Scene />
                </XR>
            </Canvas>
        </div>
    );
}
