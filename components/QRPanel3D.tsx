'use client';

/**
 * QRPanel3D — Floating 3D QR panel for receive/scan in VR/AR.
 * Renders the QR code as a CanvasTexture on a plane inside a glassmorphic frame.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, RoundedBox, Float } from '@react-three/drei';
import { Interactive } from '@react-three/xr';
import { CanvasTexture, Group } from 'three';
import { generateQRCanvas, generateAddressQR } from '@/lib/qr-codec';

interface QRPanel3DProps {
  address: string | null;
  chainId?: string;
  onClose: () => void;
  onScanActivate?: () => void;
}

function Button3D({ label, onClick, position, color = "#444", width = 0.5 }: {
  label: string; onClick: () => void; position: [number, number, number]; color?: string; width?: number;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Interactive onSelect={onClick}>
      <group position={position} onPointerDown={onClick} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
        <RoundedBox args={[width, 0.12, 0.02]} radius={0.02} smoothness={4} scale={hovered ? 1.05 : 1}>
          <meshStandardMaterial color={hovered ? "#fff" : color} emissive={hovered ? "#fff" : color} emissiveIntensity={hovered ? 0.5 : 0.2} metalness={0.8} roughness={0.2} />
        </RoundedBox>
        <Text position={[0, 0, 0.02]} fontSize={0.035} color={hovered ? "black" : "white"} anchorX="center" anchorY="middle">
          {label}
        </Text>
      </group>
    </Interactive>
  );
}

export default function QRPanel3D({ address, chainId = 'ethereum', onClose, onScanActivate }: QRPanel3DProps) {
  const [qrTexture, setQrTexture] = useState<CanvasTexture | null>(null);
  const [copied, setCopied] = useState(false);
  const groupRef = useRef<Group>(null);

  // Generate QR texture when address changes
  useEffect(() => {
    if (!address) return;
    const data = `ethereum:${address}${chainId ? `@${chainId}` : ''}`;
    generateQRCanvas(data, 256).then(canvas => {
      const texture = new CanvasTexture(canvas);
      texture.needsUpdate = true;
      setQrTexture(texture);
    }).catch(console.error);
  }, [address, chainId]);

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const truncatedAddress = useMemo(() => {
    if (!address) return 'NO WALLET CONNECTED';
    return `${address.substring(0, 10)}...${address.substring(address.length - 6)}`;
  }, [address]);

  return (
    <group ref={groupRef}>
      <Float speed={2} rotationIntensity={0.05} floatIntensity={0.15}>
        {/* Background Panel */}
        <RoundedBox args={[1.0, 1.3, 0.05]} radius={0.05} smoothness={4} position={[0, 0, -0.03]}>
          <meshStandardMaterial color="#0f172a" transparent opacity={0.92} metalness={0.9} roughness={0.1} />
        </RoundedBox>
        <RoundedBox args={[1.02, 1.32, 0.03]} radius={0.05} smoothness={4} position={[0, 0, -0.06]}>
          <meshStandardMaterial color="#a855f7" transparent opacity={0.3} emissive="#a855f7" emissiveIntensity={0.4} />
        </RoundedBox>

        {/* Title */}
        <Text position={[0, 0.52, 0.03]} fontSize={0.06} color="#a855f7" anchorX="center" fontWeight="bold">
          QR RECEIVE
        </Text>

        {/* QR Code Display */}
        <group position={[0, 0.12, 0.03]}>
          <RoundedBox args={[0.6, 0.6, 0.01]} radius={0.02} smoothness={4} position={[0, 0, -0.01]}>
            <meshStandardMaterial color="#020617" />
          </RoundedBox>
          {qrTexture ? (
            <mesh position={[0, 0, 0.01]}>
              <planeGeometry args={[0.5, 0.5]} />
              <meshBasicMaterial map={qrTexture} />
            </mesh>
          ) : (
            <Text position={[0, 0, 0.01]} fontSize={0.04} color="#64748b" anchorX="center">
              GENERATING QR...
            </Text>
          )}
        </group>

        {/* Address */}
        <Text position={[0, -0.24, 0.03]} fontSize={0.03} color="#94a3b8" anchorX="center">
          {truncatedAddress}
        </Text>
        <Text position={[0, -0.30, 0.03]} fontSize={0.025} color={copied ? "#22c55e" : "#64748b"} anchorX="center">
          {copied ? "COPIED TO CLIPBOARD!" : "TAP ADDRESS TO COPY"}
        </Text>

        {/* Interactive buttons */}
        <Interactive onSelect={handleCopy}>
          <group position={[0, -0.24, 0.03]} onPointerDown={handleCopy}>
            <mesh visible={false}>
              <planeGeometry args={[0.7, 0.08]} />
              <meshBasicMaterial transparent opacity={0} />
            </mesh>
          </group>
        </Interactive>

        {/* Action Buttons */}
        {onScanActivate && (
          <Button3D label="SCAN QR" position={[-0.22, -0.44, 0.03]} onClick={onScanActivate} color="#3b82f6" width={0.4} />
        )}
        <Button3D label="CLOSE" position={[0.22, -0.44, 0.03]} onClick={onClose} color="#334155" width={0.4} />

        {/* Decorative scan lines */}
        <mesh position={[0, 0.42, 0.03]}>
          <planeGeometry args={[0.5, 0.003]} />
          <meshStandardMaterial color="#a855f7" emissive="#a855f7" emissiveIntensity={1} />
        </mesh>
      </Float>
    </group>
  );
}
