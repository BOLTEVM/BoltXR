'use client';

/**
 * EnvironmentSelector — the scene dock: five scenes as large tiles on a console in front of you.
 *
 * In XR it sits at waist height, tilted up toward your eyes and within arm's reach, so a hand can
 * poke a tile directly and a controller ray hits it at a shallow angle; it no longer floats (a
 * moving target is hard to aim at). Hovered tiles lift and light up, the current scene is framed.
 * On the desktop it sits low in front of the camera.
 */

import { useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBox, Text } from '@react-three/drei';
import { XR_THEME } from './xr/Button3D';

export type EnvType = 'space' | 'sunset' | 'forest' | 'city' | 'rain';

interface EnvironmentSelectorProps {
  current: EnvType;
  onSelect: (env: EnvType) => void;
}

const ENVS: { type: EnvType; label: string; color: string }[] = [
  { type: 'space', label: 'DEEP SPACE', color: '#6366f1' },
  { type: 'sunset', label: 'NEON SUNSET', color: '#f43f5e' },
  { type: 'forest', label: 'ZEN GARDEN', color: '#10b981' },
  { type: 'city', label: 'CYBER CITY', color: '#3b82f6' },
  { type: 'rain', label: 'TOKEN RAIN', color: '#f59e0b' },
];

/** Tile size and spacing, metres (the dock is ~0.95 m wide). */
const TILE_W = 0.17;
const TILE_H = 0.12;
const GAP = 0.02;

function Tile({ env, selected, x, onSelect }: { env: (typeof ENVS)[number]; selected: boolean; x: number; onSelect: (e: EnvType) => void }) {
  const [hovered, setHovered] = useState(false);
  const cursor = (v: string) => { if (typeof document !== 'undefined') document.body.style.cursor = v; };
  return (
    <group
      position={[x, 0, hovered ? 0.012 : 0]}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(env.type); }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHovered(true); cursor('pointer'); }}
      onPointerOut={() => { setHovered(false); cursor('auto'); }}
    >
      {selected && (
        <RoundedBox args={[TILE_W + 0.016, TILE_H + 0.016, 0.01]} radius={0.02} position={[0, 0, -0.008]}>
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </RoundedBox>
      )}
      <RoundedBox args={[TILE_W, TILE_H, 0.022]} radius={0.016} smoothness={4}>
        <meshStandardMaterial
          color={selected || hovered ? env.color : XR_THEME.raised}
          emissive={env.color}
          emissiveIntensity={selected ? 0.55 : hovered ? 0.4 : 0.06}
          metalness={0.4}
          roughness={0.35}
        />
      </RoundedBox>
      {/* colour swatch so unselected tiles still say what they are */}
      <mesh position={[0, 0.03, 0.012]}>
        <circleGeometry args={[0.016, 24]} />
        <meshBasicMaterial color={env.color} toneMapped={false} />
      </mesh>
      <Text position={[0, -0.022, 0.013]} fontSize={0.019} maxWidth={TILE_W - 0.02} textAlign="center" color={XR_THEME.text} anchorX="center" anchorY="middle">
        {env.label}
      </Text>
    </group>
  );
}

export default function EnvironmentSelector({ current, onSelect }: EnvironmentSelectorProps) {
  const width = ENVS.length * TILE_W + (ENVS.length - 1) * GAP;
  return (
    <group>
      {/* backplate: one big, steady target behind the tiles */}
      <RoundedBox args={[width + 0.06, TILE_H + 0.1, 0.012]} radius={0.03} position={[0, 0.02, -0.02]}>
        <meshStandardMaterial color={XR_THEME.surface} transparent opacity={0.82} metalness={0.2} roughness={0.6} />
      </RoundedBox>
      <Text position={[-width / 2, TILE_H / 2 + 0.035, 0]} fontSize={0.022} color={XR_THEME.muted} anchorX="left" anchorY="middle">
        SCENE
      </Text>
      {ENVS.map((env, i) => (
        <Tile key={env.type} env={env} selected={current === env.type} x={-width / 2 + TILE_W / 2 + i * (TILE_W + GAP)} onSelect={onSelect} />
      ))}
    </group>
  );
}
