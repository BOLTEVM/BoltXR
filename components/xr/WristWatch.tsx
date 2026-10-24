'use client';

import { useMemo, useRef, useState } from 'react';
import { RoundedBox, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useXR, useXRInputSourceState } from '@react-three/xr';
import { Group, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import Button3D, { XR_THEME } from './Button3D';
import { formatUsd } from '@/lib/format';

export type WatchView = 'home' | 'pay' | 'swap' | 'farm' | 'scan';

interface WristWatchProps {
  open: boolean;
  active: WatchView;
  locked: boolean;
  totalUsd: number | null;
  onToggle: () => void;
  onSelect: (view: WatchView) => void;
}

const NAV: Array<{ id: WatchView; label: string; color: string }> = [
  { id: 'home', label: 'HOME', color: XR_THEME.raised },
  { id: 'pay', label: 'PAY', color: '#2563eb' },
  { id: 'swap', label: 'SWAP', color: '#7c3aed' },
  { id: 'farm', label: 'FARM', color: '#059669' },
  { id: 'scan', label: 'SCAN', color: '#0891b2' },
];

const materials = {
  titanium: { color: '#64748b', metalness: 0.92, roughness: 0.27 },
  ceramic: { color: '#111827', metalness: 0.5, roughness: 0.18 },
  strap: { color: '#1e293b', metalness: 0.05, roughness: 0.72 },
  dial: { color: '#07111f', metalness: 0.35, roughness: 0.32 },
};

function Strap({ side }: { side: 1 | -1 }) {
  return (
    <group>
      {Array.from({ length: 7 }, (_, i) => {
        const y = side * (0.93 + i * 0.2);
        const width = 0.83 - i * 0.025;
        return (
          <group key={i} position={[0, y, -0.1 - i * 0.008]} rotation={[side * i * 0.012, 0, 0]}>
            <RoundedBox args={[width, 0.17, 0.13]} radius={0.045} smoothness={3}>
              <meshStandardMaterial {...materials.strap} name="Watch · Strap elastomer" />
            </RoundedBox>
            <mesh position={[0, 0, 0.068]}>
              <boxGeometry args={[width * 0.72, 0.018, 0.006]} />
              <meshStandardMaterial color="#334155" roughness={0.65} name="Watch · Strap groove" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

export default function WristWatch({ open, active, locked, totalUsd, onToggle, onSelect }: WristWatchProps) {
  const root = useRef<Group>(null);
  const crown = useRef<Group>(null);
  const glow = useRef<MeshStandardMaterial>(null);
  const [crownHover, setCrownHover] = useState(false);
  const session = useXR(state => state.session);
  const hand = useXRInputSourceState('hand', 'left');
  const controller = useXRInputSourceState('controller', 'left');
  const sourceObject = hand?.object || controller?.object;
  const scratch = useMemo(() => ({ position: new Vector3(), quaternion: new Quaternion(), fallback: new Vector3() }), []);

  useFrame(({ camera, clock }) => {
    if (crown.current) crown.current.rotation.x += crownHover ? 0.035 : 0.006;
    if (glow.current) glow.current.emissiveIntensity = 0.32 + Math.sin(clock.elapsedTime * 1.8) * 0.07;
    if (!root.current || !session) return;
    if (sourceObject) {
      sourceObject.getWorldPosition(scratch.position);
      sourceObject.getWorldQuaternion(scratch.quaternion);
      scratch.fallback.set(0, 0.045, 0.015).applyQuaternion(scratch.quaternion);
      scratch.position.add(scratch.fallback);
      root.current.position.lerp(scratch.position, 0.32);
      root.current.quaternion.slerp(scratch.quaternion, 0.28);
    } else {
      // No tracked left hand yet: keep the watch reachable instead of losing it.
      scratch.fallback.set(-0.19, -0.16, -0.48).applyQuaternion(camera.quaternion).add(camera.position);
      root.current.position.lerp(scratch.fallback, 0.18);
      root.current.quaternion.slerp(camera.quaternion, 0.18);
    }
    const nextScale = 0.052;
    root.current.scale.lerp(scratch.fallback.set(nextScale, nextScale, nextScale), 0.25);
  });

  return (
    <group ref={root} scale={session ? 0.052 : 1}>
      <Strap side={1} />
      <Strap side={-1} />

      {/* Sculpted case: stepped ceramic body, titanium mid-case and raised bezel. */}
      <RoundedBox args={[1.52, 1.75, 0.24]} radius={0.26} smoothness={6} castShadow>
        <meshStandardMaterial {...materials.ceramic} name="Watch · Dark ceramic case" />
      </RoundedBox>
      <RoundedBox args={[1.46, 1.69, 0.22]} radius={0.24} smoothness={6} position={[0, 0, 0.075]} castShadow>
        <meshStandardMaterial {...materials.titanium} name="Watch · Brushed titanium mid-case" />
      </RoundedBox>
      <RoundedBox args={[1.34, 1.56, 0.15]} radius={0.21} smoothness={6} position={[0, 0, 0.19]}>
        <meshStandardMaterial {...materials.dial} name="Watch · Obsidian dial" />
      </RoundedBox>
      <RoundedBox args={[1.28, 1.5, 0.025]} radius={0.19} smoothness={5} position={[0, 0, 0.278]}>
        <meshStandardMaterial ref={glow} color="#0e7490" emissive="#22d3ee" emissiveIntensity={0.35} transparent opacity={0.32} name="Watch · Active sapphire rim" />
      </RoundedBox>
      <RoundedBox args={[1.22, 1.44, 0.025]} radius={0.17} smoothness={5} position={[0, 0, 0.296]}>
        <meshPhysicalMaterial color="#0b1524" roughness={0.14} metalness={0.2} clearcoat={0.8} clearcoatRoughness={0.12} name="Watch · Sapphire display" />
      </RoundedBox>

      {/* Crown and tactile action button. */}
      <group
        ref={crown}
        position={[0.86, 0.3, 0.02]}
        onClick={event => { event.stopPropagation(); onToggle(); }}
        onPointerOver={event => { event.stopPropagation(); setCrownHover(true); }}
        onPointerOut={() => setCrownHover(false)}
      >
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.13, 0.13, 0.19, 24]} />
          <meshStandardMaterial color={crownHover ? '#22d3ee' : '#94a3b8'} metalness={0.95} roughness={0.22} name="Watch · Digital crown" />
        </mesh>
        {Array.from({ length: 12 }, (_, i) => (
          <mesh key={i} rotation={[0, 0, Math.PI / 2]} position={[0, Math.sin(i * Math.PI / 6) * 0.128, Math.cos(i * Math.PI / 6) * 0.128]}>
            <boxGeometry args={[0.15, 0.012, 0.018]} />
            <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.3} name="Watch · Crown knurl" />
          </mesh>
        ))}
      </group>
      <RoundedBox args={[0.12, 0.35, 0.13]} radius={0.05} position={[0.79, -0.35, 0.01]} onClick={event => { event.stopPropagation(); onToggle(); }}>
        <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.25} name="Watch · Side key" />
      </RoundedBox>

      <group position={[0, 0, 0.325]}>
        <Text position={[0, 0.61, 0]} fontSize={0.075} color="#e2e8f0" anchorX="center" letterSpacing={0.08}>BOLT / WRIST OS</Text>
        <mesh position={[0, 0.51, 0]}>
          <planeGeometry args={[0.82, 0.008]} />
          <meshBasicMaterial color={locked ? '#ef4444' : '#22d3ee'} />
        </mesh>

        {!open ? (
          <group>
            <Text position={[0, 0.25, 0]} fontSize={0.095} color={locked ? '#fda4af' : '#67e8f9'} anchorX="center">
              {locked ? 'VAULT LOCKED' : 'WALLET READY'}
            </Text>
            <Text position={[0, 0.01, 0]} fontSize={0.16} color="#f8fafc" anchorX="center">
              {locked ? '—' : totalUsd === null ? 'SYNCING' : formatUsd(totalUsd)}
            </Text>
            <Text position={[0, -0.18, 0]} fontSize={0.05} color="#94a3b8" anchorX="center">TOTAL PORTFOLIO</Text>
            <Button3D label="OPEN WRIST OS" onPress={onToggle} position={[0, -0.43, 0.01]} width={0.94} height={0.2} color="#0e7490" fontSize={0.055} />
          </group>
        ) : (
          <group>
            {NAV.map((item, i) => {
              const column = i % 2;
              const row = Math.floor(i / 2);
              const selected = item.id === active;
              return (
                <Button3D
                  key={item.id}
                  label={selected ? `• ${item.label}` : item.label}
                  onPress={() => onSelect(item.id)}
                  position={i === 4 ? [0, -0.48, 0] : [(column - 0.5) * 0.57, 0.3 - row * 0.3, 0]}
                  width={i === 4 ? 1.02 : 0.51}
                  height={0.23}
                  fontSize={0.052}
                  color={selected ? '#e2e8f0' : item.color}
                />
              );
            })}
            <Text position={[0, -0.65, 0]} fontSize={0.037} color="#64748b" anchorX="center">CROWN: MINIMIZE  ·  PINCH OR TAP</Text>
          </group>
        )}
      </group>
    </group>
  );
}
