'use client';

import { useState, useRef } from 'react';
import { Float, RoundedBox, Text } from '@react-three/drei';
import { Interactive } from '@react-three/xr';
import { Group } from 'three';

interface SecureInfoPanelProps {
  title: string;
  content: string;
  onClose: () => void;
}

export default function SecureInfoPanel({ title, content, onClose }: SecureInfoPanelProps) {
  const [revealed, setRevealed] = useState(false);
  const groupRef = useRef<Group>(null);

  // Split content into chunks for display (e.g., 4 words per line for mnemonic)
  const words = content.split(' ');
  const lines = [];
  for (let i = 0; i < words.length; i += 4) {
    lines.push(words.slice(i, i + 4).join(' '));
  }

  return (
    <group ref={groupRef}>
      <Float speed={2} rotationIntensity={0.1} floatIntensity={0.2}>
        {/* Background Panel */}
        <RoundedBox args={[1.5, 1.2, 0.05]} radius={0.05} smoothness={4} position={[0, 0, -0.05]}>
          <meshStandardMaterial 
            color="#0f172a" 
            transparent 
            opacity={0.95} 
            metalness={0.9} 
            roughness={0.1} 
          />
        </RoundedBox>

        {/* Title */}
        <Text
          position={[0, 0.45, 0.03]}
          fontSize={0.08}
          color="#a855f7"
          anchorX="center"
        >
          {title}
        </Text>
        
        {/* Warning Text */}
        <Text
          position={[0, 0.30, 0.03]}
          fontSize={0.04}
          color="#ef4444"
          anchorX="center"
        >
          CRITICAL: DO NOT SHARE OR LOSE THIS INFORMATION
        </Text>

        {/* Content Area */}
        <group position={[0, 0, 0.03]}>
          <RoundedBox args={[1.3, 0.5, 0.02]} radius={0.02} smoothness={4} position={[0, 0, -0.01]}>
             <meshStandardMaterial color="#020617" />
          </RoundedBox>

          {!revealed ? (
            <Interactive onSelect={() => setRevealed(true)}>
              <group>
                <Text position={[0, 0, 0.01]} fontSize={0.06} color="#94a3b8">
                  TAP TO REVEAL
                </Text>
              </group>
            </Interactive>
          ) : (
            <group position={[0, Math.max(0.1, (lines.length - 1) * 0.05), 0.01]}>
              {lines.map((line, i) => (
                <Text key={i} position={[0, -i * 0.1, 0]} fontSize={0.05} color="white">
                  {line}
                </Text>
              ))}
            </group>
          )}
        </group>

        {/* Close Button */}
        <Interactive onSelect={onClose}>
          <group position={[0, -0.45, 0.03]}>
             <RoundedBox args={[0.5, 0.15, 0.02]} radius={0.02} smoothness={4}>
               <meshStandardMaterial color="#4c1d95" emissive="#6d28d9" emissiveIntensity={0.2} />
             </RoundedBox>
            <Text position={[0, 0, 0.02]} fontSize={0.04} color="white">
              I HAVE SAVED IT SECURELY
            </Text>
          </group>
        </Interactive>
      </Float>
    </group>
  );
}
