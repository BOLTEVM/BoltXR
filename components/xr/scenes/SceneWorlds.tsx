'use client';

/**
 * Primitive-built surroundings for the wallet. Everything sits well outside arm's reach (the wallet
 * UI lives within ~1.5 m), repeated objects are instanced, and nothing loads from the network.
 * `floor` is the ground height: 0 in a headset (local-floor space), lower on the desktop camera.
 */

import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Grid, Stars } from '@react-three/drei';
import { CanvasTexture, DoubleSide, Group, RepeatWrapping, SRGBColorSpace } from 'three';
import { mulberry32 } from '@/lib/xr/prng';
import Instanced, { type InstanceSpec } from './Instanced';

interface WorldProps { floor: number }

/** Points on a ring around the user, skipping the arc straight ahead where the wallet UI sits when `clearFront`. */
function ringPoints(seed: number, count: number, minR: number, maxR: number, clearFront = false) {
    const rand = mulberry32(seed);
    const out: { x: number; z: number; r: number; rand: () => number }[] = [];
    while (out.length < count) {
        const angle = rand() * Math.PI * 2;
        const r = minR + rand() * (maxR - minR);
        const x = Math.sin(angle) * r, z = -Math.cos(angle) * r;
        if (clearFront && z < 0 && Math.abs(x) < r * 0.35 && r < 10) continue;
        out.push({ x, z, r, rand });
    }
    return out;
}

function Spin({ speed, axis = 'y', children }: { speed: number; axis?: 'x' | 'y' | 'z'; children: ReactNode }) {
    const ref = useRef<Group>(null);
    useFrame((_, delta) => { if (ref.current) ref.current.rotation[axis] += delta * speed; });
    return <group ref={ref}>{children}</group>;
}

/* ---------------------------------------------------------------- Deep space */

export function SpaceWorld({ floor }: WorldProps) {
    const asteroids = useMemo<InstanceSpec[]>(() => ringPoints(0x5ace, 40, 20, 30).map(({ x, z, rand }) => {
        const s = 0.4 + rand() * 0.9;
        return { position: [x, floor + 10 + rand() * 8, z], rotation: [rand() * 6, rand() * 6, rand() * 6], scale: [s, s * (0.6 + rand() * 0.5), s] };
    }), [floor]);
    return (
        <group>
            <Stars radius={100} depth={50} count={3500} factor={4} saturation={0} fade speed={0.6} />
            {/* ringed gas giant */}
            <group position={[-62, floor + 34, -120]} rotation={[0.35, 0, 0.3]}>
                <mesh>
                    <sphereGeometry args={[10, 48, 32]} />
                    <meshStandardMaterial color="#7c3aed" emissive="#4c1d95" emissiveIntensity={0.35} roughness={0.8} fog={false} />
                </mesh>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[13, 19, 96]} />
                    <meshBasicMaterial color="#c4b5fd" transparent opacity={0.45} side={DoubleSide} fog={false} />
                </mesh>
            </group>
            {/* moon */}
            <mesh position={[30, floor + 12, -48]}>
                <icosahedronGeometry args={[3.2, 2]} />
                <meshStandardMaterial color="#cbd5e1" roughness={1} flatShading emissive="#334155" emissiveIntensity={0.3} />
            </mesh>
            {/* slow asteroid belt around the user */}
            <Spin speed={0.02}>
                <Instanced items={asteroids}>
                    <dodecahedronGeometry args={[1, 0]} />
                    <meshStandardMaterial color="#64748b" roughness={0.95} flatShading />
                </Instanced>
            </Spin>
            <Grid args={[20, 20]} cellColor="#202030" sectionColor="#404060" position={[0, floor, 0]} infiniteGrid fadeDistance={45} />
        </group>
    );
}

/* ---------------------------------------------------------------- Neon sunset (synthwave) */

export function SunsetWorld({ floor }: WorldProps) {
    const mountains = useMemo<InstanceSpec[]>(() => {
        const rand = mulberry32(0x5e7);
        return Array.from({ length: 22 }, (_, i) => {
            const angle = -1.25 + (i / 21) * 2.5 + (rand() - 0.5) * 0.08;
            const r = 62 + rand() * 18;
            const h = 9 + rand() * 16;
            return { position: [Math.sin(angle) * r, floor + h / 2, -Math.cos(angle) * r], rotation: [0, rand() * 3, 0], scale: [7 + rand() * 6, h, 7 + rand() * 6] };
        });
    }, [floor]);
    const palms = useMemo(() => [[-9, -16], [10, -18], [-14, -7], [15, -9]] as [number, number][], []);
    return (
        <group>
            {/* striped sun on the horizon */}
            <group position={[0, floor + 14, -100]}>
                <mesh>
                    <circleGeometry args={[18, 64]} />
                    <meshBasicMaterial color="#fbbf24" toneMapped={false} fog={false} />
                </mesh>
                <mesh position={[0, -6, 0.1]}>
                    <circleGeometry args={[18.2, 64, Math.PI, Math.PI]} />
                    <meshBasicMaterial color="#fb7185" toneMapped={false} fog={false} transparent opacity={0.65} />
                </mesh>
                {[-2, -5, -8, -11, -14].map((y, i) => (
                    <mesh key={y} position={[0, y, 0.2]}>
                        <planeGeometry args={[40, 0.5 + i * 0.35]} />
                        <meshBasicMaterial color="#3b0a45" toneMapped={false} fog={false} />
                    </mesh>
                ))}
            </group>
            {/* low-poly mountain range with neon edges */}
            <Instanced items={mountains}>
                <coneGeometry args={[1, 1, 4, 1]} />
                <meshStandardMaterial color="#2e1065" emissive="#7e22ce" emissiveIntensity={0.25} flatShading roughness={0.9} />
            </Instanced>
            <Instanced items={mountains}>
                <coneGeometry args={[1.01, 1.01, 4, 1]} />
                <meshBasicMaterial color="#f472b6" wireframe toneMapped={false} />
            </Instanced>
            {/* primitive palms: a leaning trunk and a fan of fronds */}
            {palms.map(([x, z], i) => (
                <group key={i} position={[x, floor, z]} rotation={[0, i * 1.7, x < 0 ? 0.12 : -0.12]}>
                    <mesh position={[0, 3, 0]}>
                        <cylinderGeometry args={[0.16, 0.26, 6, 8]} />
                        <meshStandardMaterial color="#1e1b4b" emissive="#be185d" emissiveIntensity={0.2} />
                    </mesh>
                    {Array.from({ length: 7 }, (_, k) => (
                        <mesh key={k} position={[0, 6, 0]} rotation={[0.9, (k / 7) * Math.PI * 2, 0]}>
                            <coneGeometry args={[0.45, 3.4, 3]} />
                            <meshStandardMaterial color="#0f172a" emissive="#22d3ee" emissiveIntensity={0.55} flatShading />
                        </mesh>
                    ))}
                </group>
            ))}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floor - 0.01, 0]}>
                <circleGeometry args={[150, 48]} />
                <meshStandardMaterial color="#12041f" roughness={0.4} metalness={0.6} />
            </mesh>
            <Grid args={[20, 20]} cellColor="#be185d" sectionColor="#f472b6" sectionThickness={1.4} position={[0, floor, 0]} infiniteGrid fadeDistance={70} />
        </group>
    );
}

/* ---------------------------------------------------------------- Zen garden */

export function ZenGardenWorld({ floor }: WorldProps) {
    const trees = useMemo(() => ringPoints(0x2e7, 28, 13, 30).map(({ x, z, rand }) => ({
        x, z, h: 2.5 + rand() * 3, blossom: rand() < 0.45, s: 1 + rand() * 0.8, turn: rand() * 6,
    })), []);
    const trunks = useMemo<InstanceSpec[]>(() => trees.map(t => ({ position: [t.x, floor + t.h / 2, t.z], scale: [1, t.h, 1] })), [trees, floor]);
    const blossoms = useMemo<InstanceSpec[]>(() => trees.filter(t => t.blossom).map(t => ({ position: [t.x, floor + t.h + 0.6, t.z], rotation: [0, t.turn, 0], scale: [t.s * 1.6, t.s * 1.2, t.s * 1.6] })), [trees, floor]);
    const pines = useMemo<InstanceSpec[]>(() => trees.filter(t => !t.blossom).map(t => ({ position: [t.x, floor + t.h + 1, t.z], rotation: [0, t.turn, 0], scale: [t.s * 1.3, t.s * 3, t.s * 1.3] })), [trees, floor]);
    const rocks = useMemo<InstanceSpec[]>(() => [
        { position: [-4.2, floor + 0.35, -5.5], scale: [1.1, 0.7, 0.9], rotation: [0.2, 0.4, 0] },
        { position: [-3.4, floor + 0.2, -5.0], scale: [0.5, 0.4, 0.5], rotation: [0.5, 1, 0.3] },
        { position: [4.8, floor + 0.45, -6.5], scale: [1.4, 0.9, 1.1], rotation: [0, 2, 0.1] },
        { position: [5.6, floor + 0.2, -5.6], scale: [0.6, 0.35, 0.5], rotation: [0.3, 0.2, 0] },
        { position: [-6.5, floor + 0.3, 2.5], scale: [0.9, 0.6, 0.8], rotation: [0.1, 1.2, 0] },
    ], [floor]);
    const rakeRings = [[-4, -5.3, [1.6, 2.1, 2.6]], [5, -6.2, [2, 2.5, 3]]] as const;
    return (
        <group>
            {/* raked sand court and moss beyond it */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floor, 0]} receiveShadow>
                <circleGeometry args={[11, 64]} />
                <meshStandardMaterial color="#d8c9a3" roughness={1} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floor - 0.02, 0]}>
                <circleGeometry args={[150, 48]} />
                <meshStandardMaterial color="#1f4d2b" roughness={1} />
            </mesh>
            {rakeRings.map(([x, z, radii]) => radii.map(r => (
                <mesh key={`${x}-${r}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, floor + 0.01, z]}>
                    <ringGeometry args={[r, r + 0.06, 64]} />
                    <meshStandardMaterial color="#b9a77f" roughness={1} />
                </mesh>
            )))}
            <Instanced items={rocks} castShadow>
                <dodecahedronGeometry args={[1, 0]} />
                <meshStandardMaterial color="#6b7280" roughness={0.9} flatShading />
            </Instanced>
            {/* koi pond */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[7, floor + 0.02, 1]}>
                <circleGeometry args={[2.4, 48]} />
                <meshStandardMaterial color="#0e7490" roughness={0.08} metalness={0.3} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[7, floor + 0.015, 1]}>
                <ringGeometry args={[2.4, 2.75, 48]} />
                <meshStandardMaterial color="#57534e" roughness={1} />
            </mesh>
            {/* torii gate */}
            <group position={[0, floor, -15]}>
                {[-2.4, 2.4].map(x => (
                    <mesh key={x} position={[x, 2.6, 0]}>
                        <cylinderGeometry args={[0.24, 0.28, 5.2, 16]} />
                        <meshStandardMaterial color="#dc2626" roughness={0.6} />
                    </mesh>
                ))}
                <mesh position={[0, 5.45, 0]}>
                    <boxGeometry args={[6.8, 0.42, 0.55]} />
                    <meshStandardMaterial color="#111827" roughness={0.7} />
                </mesh>
                <mesh position={[0, 4.4, 0]}>
                    <boxGeometry args={[5.6, 0.28, 0.35]} />
                    <meshStandardMaterial color="#dc2626" roughness={0.6} />
                </mesh>
            </group>
            {/* stone lanterns with a warm glow */}
            {[[-2.6, -9], [2.6, -9]].map(([x, z]) => (
                <group key={x} position={[x, floor, z]}>
                    <mesh position={[0, 0.5, 0]}><cylinderGeometry args={[0.14, 0.2, 1, 8]} /><meshStandardMaterial color="#9ca3af" roughness={1} /></mesh>
                    <mesh position={[0, 1.15, 0]}><boxGeometry args={[0.5, 0.36, 0.5]} /><meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={1.4} toneMapped={false} /></mesh>
                    <mesh position={[0, 1.48, 0]}><coneGeometry args={[0.52, 0.34, 4]} /><meshStandardMaterial color="#9ca3af" roughness={1} flatShading /></mesh>
                </group>
            ))}
            {/* trees: cherry blossoms and pines */}
            <Instanced items={trunks}>
                <cylinderGeometry args={[0.12, 0.2, 1, 6]} />
                <meshStandardMaterial color="#44302a" roughness={1} />
            </Instanced>
            <Instanced items={blossoms}>
                <icosahedronGeometry args={[1, 0]} />
                <meshStandardMaterial color="#f9a8d4" emissive="#db2777" emissiveIntensity={0.15} roughness={0.9} flatShading />
            </Instanced>
            <Instanced items={pines}>
                <coneGeometry args={[1, 1, 7]} />
                <meshStandardMaterial color="#166534" roughness={0.9} flatShading />
            </Instanced>
        </group>
    );
}

/* ---------------------------------------------------------------- Cyber city */

function useWindowTexture() {
    return useMemo(() => {
        if (typeof document === 'undefined') return null;
        const canvas = document.createElement('canvas');
        canvas.width = 32; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        const rand = mulberry32(0xc17);
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 32, 64);
        const lit = ['#7dd3fc', '#f0abfc', '#fde68a', '#a5b4fc'];
        for (let y = 2; y < 64; y += 4) for (let x = 2; x < 32; x += 4) {
            if (rand() < 0.42) { ctx.fillStyle = lit[Math.floor(rand() * lit.length)]; ctx.fillRect(x, y, 2, 2); }
        }
        const texture = new CanvasTexture(canvas);
        texture.colorSpace = SRGBColorSpace;
        texture.wrapS = texture.wrapT = RepeatWrapping;
        return texture;
    }, []);
}

export function CityWorld({ floor }: WorldProps) {
    const windows = useWindowTexture();
    const towers = useMemo(() => ringPoints(0xc1, 64, 16, 48).map(({ x, z, r, rand }) => {
        const h = 6 + rand() * (r > 30 ? 40 : 24);
        const w = 2 + rand() * 3;
        return { x, z, h, w, d: 2 + rand() * 3, turn: Math.atan2(x, z), neon: ['#22d3ee', '#e879f9', '#3b82f6', '#a78bfa'][Math.floor(rand() * 4)] };
    }), []);
    const bodies = useMemo<InstanceSpec[]>(() => towers.map(t => ({ position: [t.x, floor + t.h / 2, t.z], rotation: [0, t.turn, 0], scale: [t.w, t.h, t.d] })), [towers, floor]);
    const crowns = useMemo<InstanceSpec[]>(() => towers.map(t => ({ position: [t.x, floor + t.h + 0.08, t.z], rotation: [0, t.turn, 0], scale: [t.w * 1.02, 0.16, t.d * 1.02], color: t.neon })), [towers, floor]);
    return (
        <group>
            <Instanced items={bodies}>
                <boxGeometry />
                <meshStandardMaterial color="#0b1224" metalness={0.7} roughness={0.35} emissive="#ffffff" emissiveMap={windows} emissiveIntensity={windows ? 0.9 : 0} />
            </Instanced>
            <Instanced items={crowns}>
                <boxGeometry />
                <meshBasicMaterial toneMapped={false} />
            </Instanced>
            {/* hovering neon rings */}
            {[[-8, 9, -14, '#22d3ee'], [9, 12, -20, '#e879f9'], [0, 16, -30, '#3b82f6']].map(([x, y, z, c]) => (
                <Spin key={String(c)} speed={0.25} axis="y">
                    <mesh position={[x as number, floor + (y as number), z as number]} rotation={[Math.PI / 2.6, 0, 0]}>
                        <torusGeometry args={[2.4, 0.08, 12, 64]} />
                        <meshBasicMaterial color={c as string} toneMapped={false} />
                    </mesh>
                </Spin>
            ))}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floor - 0.01, 0]}>
                <circleGeometry args={[150, 48]} />
                <meshStandardMaterial color="#020617" metalness={0.8} roughness={0.25} />
            </mesh>
            <Grid args={[20, 20]} cellColor="#0c4a6e" sectionColor="#22d3ee" position={[0, floor, 0]} infiniteGrid fadeDistance={50} />
        </group>
    );
}

/* ---------------------------------------------------------------- Token rain floor */

export function RainFloor({ floor }: WorldProps) {
    return <Grid args={[20, 20]} cellColor="#3b2a0a" sectionColor="#b45309" position={[0, floor, 0]} infiniteGrid fadeDistance={45} />;
}
