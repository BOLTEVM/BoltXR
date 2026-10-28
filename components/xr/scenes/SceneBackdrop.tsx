'use client';

/**
 * SceneBackdrop — sky, fog, lighting, reflections and the primitive world for the selected scene.
 * `passthrough` draws no sky or world, so an immersive-ar session shows the room behind the wallet.
 */

import { Environment, Lightformer } from '@react-three/drei';
import { SCENES, type EnvType } from '@/lib/xr/scenes';
import SafeBoundary from '../SafeBoundary';
import TokenRain from '../../TokenRain';
import SkyDome from './SkyDome';
import { CityWorld, RainFloor, SpaceWorld, SunsetWorld, ZenGardenWorld } from './SceneWorlds';

interface SceneBackdropProps {
    env: EnvType;
    /** Ground height: 0 in a headset's local-floor space. */
    floor: number;
    rainColors: string[];
}

export default function SceneBackdrop({ env, floor, rainColors }: SceneBackdropProps) {
    const look = SCENES[env];
    const open = env !== 'passthrough';
    return (
        <>
            <ambientLight color={look.ambient.color} intensity={look.ambient.intensity} />
            <directionalLight position={look.sun.position} color={look.sun.color} intensity={look.sun.intensity} />
            <pointLight position={[-6, 3, 1]} intensity={0.65} color={look.color} />
            {look.fog && <fog attach="fog" args={[look.fog.color, look.fog.near, look.fog.far]} />}

            {/* Reflections for metal and glass. Keyed by scene: frames={1} renders once, so a new scene needs a new map. */}
            <Environment key={`reflections-${env}`} resolution={64} frames={1}>
                <Lightformer intensity={1.2} color={look.color} position={[0, 4, -6]} scale={[10, 4, 1]} />
                <Lightformer intensity={0.6} color="#ffffff" position={[-6, 2, 2]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
                <Lightformer intensity={0.4} color={look.sky[1]} position={[6, 1, 2]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} />
            </Environment>

            {open && <SkyDome colors={look.sky} />}
            {/* keyed so one scene failing does not leave the others blank */}
            <SafeBoundary key={`world-${env}`}>
                {env === 'space' && <SpaceWorld floor={floor} />}
                {env === 'sunset' && <SunsetWorld floor={floor} />}
                {env === 'forest' && <ZenGardenWorld floor={floor} />}
                {env === 'city' && <CityWorld floor={floor} />}
                {env === 'rain' && (
                    <>
                        <TokenRain count={40} colors={rainColors} />
                        <RainFloor floor={floor} />
                    </>
                )}
            </SafeBoundary>
        </>
    );
}
