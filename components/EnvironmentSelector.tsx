'use client';

/**
 * EnvironmentSelector — the scene dock: six scenes as large tiles on a console in front of you.
 *
 * In XR it sits at waist height, tilted up toward your eyes and within arm's reach, so a hand can
 * poke a tile directly and a controller ray hits it at a shallow angle; it no longer floats (a
 * moving target is hard to aim at). Hovered tiles lift and light up, the current scene is framed.
 * On the desktop it sits low in front of the camera. Passthrough only works in an immersive-ar
 * session; elsewhere its tile is dimmed and says so.
 */

import { useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBox, Text } from '@react-three/drei';
import { XR_THEME } from './xr/Button3D';
import { SCENES, SCENE_ORDER, type EnvType } from '@/lib/xr/scenes';

interface EnvironmentSelectorProps {
  current: EnvType;
  onSelect: (env: EnvType) => void;
  /** Whether this session can show the room (immersive-ar). */
  passthroughAvailable: boolean;
}

const ENVS = SCENE_ORDER.map(type => ({ type, label: SCENES[type].label, color: SCENES[type].color }));

/** Tile size and spacing, metres (the dock is ~1 m wide). */
const TILE_W = 0.15;
const TILE_H = 0.12;
const GAP = 0.02;

function Tile({ env, selected, disabled, x, onSelect }: { env: (typeof ENVS)[number]; selected: boolean; disabled: boolean; x: number; onSelect: (e: EnvType) => void }) {
  const [hovered, setHovered] = useState(false);
  const cursor = (v: string) => { if (typeof document !== 'undefined') document.body.style.cursor = v; };
  return (
    <group
      position={[x, 0, hovered && !disabled ? 0.012 : 0]}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (!disabled) onSelect(env.type); }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHovered(true); cursor(disabled ? 'not-allowed' : 'pointer'); }}
      onPointerOut={() => { setHovered(false); cursor('auto'); }}
    >
      {selected && (
        <RoundedBox args={[TILE_W + 0.016, TILE_H + 0.016, 0.01]} radius={0.02} position={[0, 0, -0.008]}>
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </RoundedBox>
      )}
      <RoundedBox args={[TILE_W, TILE_H, 0.022]} radius={0.016} smoothness={4}>
        <meshStandardMaterial
          color={(selected || hovered) && !disabled ? env.color : XR_THEME.raised}
          emissive={env.color}
          emissiveIntensity={disabled ? 0 : selected ? 0.55 : hovered ? 0.4 : 0.06}
          transparent={disabled}
          opacity={disabled ? 0.5 : 1}
          metalness={0.4}
          roughness={0.35}
        />
      </RoundedBox>
      {/* colour swatch so unselected tiles still say what they are */}
      <mesh position={[0, 0.03, 0.012]}>
        <circleGeometry args={[0.016, 24]} />
        <meshBasicMaterial color={env.color} toneMapped={false} transparent={disabled} opacity={disabled ? 0.35 : 1} />
      </mesh>
      <Text position={[0, -0.018, 0.013]} fontSize={0.017} maxWidth={TILE_W - 0.02} textAlign="center" color={disabled ? XR_THEME.muted : XR_THEME.text} anchorX="center" anchorY="middle">
        {env.label}
      </Text>
      {disabled && (
        <Text position={[0, -0.04, 0.013]} fontSize={0.012} color={XR_THEME.muted} anchorX="center" anchorY="middle">
          AR SESSION ONLY
        </Text>
      )}
    </group>
  );
}

export default function EnvironmentSelector({ current, onSelect, passthroughAvailable }: EnvironmentSelectorProps) {
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
        <Tile key={env.type} env={env} selected={current === env.type} disabled={env.type === 'passthrough' && !passthroughAvailable} x={-width / 2 + TILE_W / 2 + i * (TILE_W + GAP)} onSelect={onSelect} />
      ))}
    </group>
  );
}
