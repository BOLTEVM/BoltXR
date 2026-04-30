'use client';

import { useState } from 'react';
import { Text, RoundedBox, Float } from '@react-three/drei';
import { Interactive } from '@react-three/xr';

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
  { type: 'rain', label: 'TOKEN RAIN', color: '#f59e0b' }
];

export default function EnvironmentSelector({ current, onSelect }: EnvironmentSelectorProps) {
  return (
    <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5}>
      <group>
        <Text position={[0, 0.4, 0]} fontSize={0.06} color="white">ENVIRONMENT SELECTOR</Text>
        
        {ENVS.map((env, i) => (
          <Interactive key={env.type} onSelect={() => onSelect(env.type)}>
            <group position={[(i - 2) * 0.35, 0, 0]}>
              <RoundedBox args={[0.3, 0.3, 0.05]} radius={0.02}>
                <meshStandardMaterial 
                  color={current === env.type ? env.color : "#1e293b"} 
                  emissive={current === env.type ? env.color : "#000"}
                  emissiveIntensity={0.5}
                />
              </RoundedBox>
              <Text 
                position={[0, -0.22, 0.03]} 
                fontSize={0.04} 
                color="white" 
                rotation={[0, 0, 0]}
                maxWidth={0.25}
                textAlign="center"
              >
                {env.label}
              </Text>
            </group>
          </Interactive>
        ))}
      </group>
    </Float>
  );
}
