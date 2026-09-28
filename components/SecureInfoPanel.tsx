'use client';

import { useState } from 'react';
import { RoundedBox, Text } from '@react-three/drei';
import Button3D, { XR_THEME } from './xr/Button3D';

interface SecureInfoPanelProps {
  title: string;
  content: string;
  onClose: () => void;
}

/** Shows the recovery phrase: hidden until revealed, closable only after reveal. */
export default function SecureInfoPanel({ title, content, onClose }: SecureInfoPanelProps) {
  const [revealed, setRevealed] = useState(false);
  const words = content.trim().split(/\s+/);

  return (
    <group>
      <RoundedBox args={[1.7, 1.4, 0.05]} radius={0.05} smoothness={4} position={[0, 0, -0.05]}>
        <meshStandardMaterial color={XR_THEME.surface} transparent opacity={0.96} metalness={0.8} roughness={0.2} />
      </RoundedBox>

      <Text position={[0, 0.58, 0.01]} fontSize={0.075} color="#a78bfa" anchorX="center">{title}</Text>
      <Text position={[0, 0.46, 0.01]} fontSize={0.034} color={XR_THEME.danger} anchorX="center" maxWidth={1.5} textAlign="center">
        WRITE THESE WORDS DOWN IN ORDER. ANYONE WITH THEM CONTROLS YOUR FUNDS.
      </Text>

      <group position={[0, 0.03, 0.01]}>
        <RoundedBox args={[1.5, 0.62, 0.02]} radius={0.03} smoothness={4} position={[0, 0, -0.015]}>
          <meshStandardMaterial color="#020617" />
        </RoundedBox>
        {revealed ? (
          words.map((word, i) => (
            <Text
              key={i}
              position={[((i % 3) - 1) * 0.48, 0.22 - Math.floor(i / 3) * (0.44 / Math.max(1, Math.ceil(words.length / 3) - 1)), 0.01]}
              fontSize={0.045}
              color={XR_THEME.text}
              anchorX="center"
            >
              {`${i + 1}. ${word}`}
            </Text>
          ))
        ) : (
          <Button3D label="TAP TO REVEAL" onPress={() => setRevealed(true)} width={0.7} height={0.16} color={XR_THEME.neutral} />
        )}
      </group>

      <Button3D
        label={revealed ? 'I HAVE SAVED IT SECURELY' : 'REVEAL THE PHRASE FIRST'}
        onPress={onClose}
        position={[0, -0.52, 0.01]}
        width={0.9}
        height={0.15}
        color={XR_THEME.brand}
        disabled={!revealed}
      />
    </group>
  );
}
