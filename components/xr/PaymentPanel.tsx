'use client';

import { useEffect, useMemo, useState } from 'react';
import { RoundedBox, Text } from '@react-three/drei';
import { CanvasTexture } from 'three';
import Button3D, { XR_THEME } from './Button3D';
import { useWallet } from '@/hooks/useWallet';
import { buildAddressPayload, generateQRCanvas } from '@/lib/qr-codec';
import { truncateAddress } from '@/lib/format';

export default function PaymentPanel({ initialChain, onSend, onScan, onRequestUnlock, onClose }: {
  initialChain?: string | null;
  onSend: (chainKey: string) => void;
  onScan: (chainKey: string) => void;
  onRequestUnlock: () => void;
  onClose: () => void;
}) {
  const { tokens, addresses, isLocked } = useWallet();
  const available = useMemo(() => tokens.filter(token => token.address || addresses[token.chainKey]), [tokens, addresses]);
  const [chainKey, setChainKey] = useState(initialChain && available.some(token => token.chainKey === initialChain) ? initialChain : available[0]?.chainKey || 'ethereum');
  const [texture, setTexture] = useState<CanvasTexture | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = available.find(item => item.chainKey === chainKey) || available[0];
  const address = token?.address || addresses[chainKey] || null;

  useEffect(() => {
    if (!address || !token) return;
    let cancelled = false;
    let next: CanvasTexture | null = null;
    queueMicrotask(() => { if (!cancelled) setTexture(null); });
    generateQRCanvas(buildAddressPayload(address, token.chainKey), 384).then(canvas => {
      if (cancelled) return;
      next = new CanvasTexture(canvas);
      next.needsUpdate = true;
      setTexture(next);
    }).catch(() => { if (!cancelled) setError('Could not generate the receive QR'); });
    return () => { cancelled = true; next?.dispose(); };
  }, [address, token]);

  const cycleChain = () => {
    if (!available.length) return;
    const index = available.findIndex(item => item.chainKey === chainKey);
    setChainKey(available[(index + 1 + available.length) % available.length].chainKey);
    setCopied(false);
    setError(null);
  };

  const copy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setError(null);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Clipboard blocked by the browser');
    }
  };

  return (
    <group>
      <RoundedBox args={[1.55, 3.15, 0.08]} radius={0.09} smoothness={5}>
        <meshStandardMaterial color="#07111f" metalness={0.45} roughness={0.3} name="Pay · Obsidian panel" />
      </RoundedBox>
      <RoundedBox args={[1.57, 3.17, 0.03]} radius={0.09} smoothness={5} position={[0, 0, -0.05]}>
        <meshStandardMaterial color="#2563eb" emissive="#3b82f6" emissiveIntensity={0.2} transparent opacity={0.35} name="Pay · Blue rim" />
      </RoundedBox>
      <group position={[0, 0, 0.06]}>
        <Text position={[0, 1.24, 0]} fontSize={0.08} color="#f8fafc" anchorX="center">PAY / RECEIVE</Text>
        <Button3D
          label={token ? `${token.network.toUpperCase()} · ${token.symbol}  ›` : 'NO NETWORK'}
          onPress={cycleChain}
          position={[0, 1.01, 0]}
          width={1.22}
          height={0.18}
          fontSize={0.04}
          color={token?.color || XR_THEME.raised}
          disabled={!token}
        />
        <RoundedBox args={[0.94, 0.94, 0.025]} radius={0.045} smoothness={4} position={[0, 0.39, -0.01]}>
          <meshStandardMaterial color="#e2e8f0" roughness={0.75} name="Pay · QR quiet zone" />
        </RoundedBox>
        {texture ? (
          <mesh position={[0, 0.39, 0.012]}>
            <planeGeometry args={[0.86, 0.86]} />
            <meshBasicMaterial map={texture} toneMapped={false} />
          </mesh>
        ) : (
          <Text position={[0, 0.39, 0.02]} fontSize={0.04} color="#475569" anchorX="center">
            {isLocked ? 'UNLOCK TO RECEIVE' : 'GENERATING QR…'}
          </Text>
        )}
        <Text position={[0, -0.16, 0]} fontSize={0.045} color="#cbd5e1" anchorX="center">
          {address ? truncateAddress(address, 12, 10) : 'ADDRESS UNAVAILABLE'}
        </Text>
        <Button3D label={copied ? '✓  ADDRESS COPIED' : '▣  COPY ADDRESS'} onPress={() => void copy()} position={[0, -0.4, 0]} width={1.18} height={0.2} fontSize={0.047} color={copied ? '#059669' : '#475569'} disabled={!address} />
        {isLocked ? (
          <Button3D label="UNLOCK VAULT TO PAY" onPress={onRequestUnlock} position={[0, -0.67, 0]} width={1.18} height={0.21} fontSize={0.043} color="#7c3aed" />
        ) : (
          <Button3D label="↗  SEND FROM THIS NETWORK" onPress={() => token && onSend(token.chainKey)} position={[0, -0.67, 0]} width={1.18} height={0.21} fontSize={0.043} color="#2563eb" disabled={!token?.canSend} />
        )}
        <Button3D label="⌗  SCAN RECIPIENT QR" onPress={() => onScan(chainKey)} position={[0, -0.94, 0]} width={1.18} height={0.21} fontSize={0.043} color="#0891b2" />
        <Text position={[0, -1.18, 0]} fontSize={0.032} color={error ? '#fda4af' : XR_THEME.muted} anchorX="center" maxWidth={1.28} textAlign="center">
          {(error || (token ? `ONLY SEND ${token.symbol} OR SUPPORTED ASSETS ON ${token.network.toUpperCase()}` : 'SET UP YOUR VAULT FIRST')).toUpperCase()}
        </Text>
        <Button3D label="CLOSE" onPress={onClose} position={[0, -1.52, 0]} width={0.56} height={0.15} fontSize={0.035} />
      </group>
    </group>
  );
}
