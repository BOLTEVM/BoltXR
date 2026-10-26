'use client';

import { useEffect, useRef, useState } from 'react';
import { RoundedBox, Text } from '@react-three/drei';
import { VideoTexture } from 'three';
import Button3D, { XR_THEME } from './Button3D';
import { useQRScanner } from '@/hooks/useQRScanner';
import { parseQRPayload, type QRPayload } from '@/lib/qr-codec';
import { resolveChainKey } from '@/lib/boltows/chains';
import { truncateAddress } from '@/lib/format';
import { useWallet } from '@/hooks/useWallet';

function cameraError(error: unknown): string {
  const name = (error as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera permission denied. Allow it in the headset browser, then retry.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No scannable camera was exposed by this device.';
  if (name === 'NotReadableError') return 'The camera is busy in another application.';
  return 'This headset browser did not provide camera frames. Paste the address instead.';
}

export default function QRScannerPanel({ chainKey, onAddress, onClose }: {
  chainKey: string;
  onAddress: (address: string, chainKey: string) => void;
  onClose: () => void;
}) {
  const [video] = useState(() => {
    const element = document.createElement('video');
    element.muted = true;
    element.playsInline = true;
    return element;
  });
  const videoRef = useRef<HTMLVideoElement>(video);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoTexture, setVideoTexture] = useState<VideoTexture | null>(null);
  const [result, setResult] = useState<{ payload: QRPayload; raw: string } | null>(null);
  const { validateAddress } = useWallet();
  const { scannedData, reset } = useQRScanner(videoRef, ready && !result);
  const [handled, setHandled] = useState(0);

  useEffect(() => {
    if (result) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    const activeVideo = videoRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      queueMicrotask(() => setError('This browser does not expose camera scanning. Paste the address instead.'));
      return;
    }
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    }).then(async media => {
      if (cancelled) {
        media.getTracks().forEach(track => track.stop());
        return;
      }
      stream = media;
      if (!activeVideo) return;
      activeVideo.srcObject = media;
      let playbackTimeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          activeVideo.play(),
          new Promise<never>((_, reject) => {
            playbackTimeout = setTimeout(() => reject(new Error('Camera frames timed out')), 12_000);
          }),
        ]);
      } finally {
        clearTimeout(playbackTimeout);
      }
      if (cancelled) return;
      const texture = new VideoTexture(activeVideo);
      setVideoTexture(previous => { previous?.dispose(); return texture; });
      setReady(true);
    }).catch(cause => { if (!cancelled) setError(cameraError(cause)); });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach(track => track.stop());
      if (activeVideo) activeVideo.srcObject = null;
    };
  }, [attempt, result]);

  useEffect(() => () => videoTexture?.dispose(), [videoTexture]);

  if (scannedData && scannedData.timestamp !== handled) {
    setHandled(scannedData.timestamp);
    const payload = parseQRPayload(scannedData.data);
    if (payload) {
      setResult({ payload, raw: scannedData.data });
      setError(null);
    } else {
      setError('QR read, but it is not a supported wallet address. Keep scanning or paste instead.');
    }
  }

  const scannedChainId = result?.payload.type === 'address' ? result.payload.chainId : undefined;
  const resolvedChain = resolveChainKey(scannedChainId);
  const scannedChain = resolvedChain || chainKey;
  const knownNetwork = !scannedChainId || resolvedChain !== null;
  const valid = result?.payload.type === 'address' && knownNetwork && validateAddress(result.payload.address, scannedChain);
  const restart = () => {
    reset();
    setResult(null);
    setHandled(0);
    setReady(false);
    setError(null);
    setAttempt(value => value + 1);
  };

  return (
    <group>
      {/* The off-DOM video feeds a VideoTexture, keeping the viewfinder inside XR. */}
      <RoundedBox args={[1.55, 2.55, 0.08]} radius={0.09} smoothness={5}>
        <meshStandardMaterial color="#07111f" metalness={0.45} roughness={0.3} name="Scan · Obsidian panel" />
      </RoundedBox>
      <RoundedBox args={[1.57, 2.57, 0.03]} radius={0.09} smoothness={5} position={[0, 0, -0.05]}>
        <meshStandardMaterial color="#0891b2" emissive="#22d3ee" emissiveIntensity={0.2} transparent opacity={0.35} name="Scan · Cyan rim" />
      </RoundedBox>
      <group position={[0, 0, 0.06]}>
        <Text position={[0, 1.1, 0]} fontSize={0.078} color="#f8fafc" anchorX="center">QR SCANNER</Text>
        <Text position={[0, 0.95, 0]} fontSize={0.034} color={XR_THEME.muted} anchorX="center">CAMERA STARTS ONLY WHILE THIS PANEL IS OPEN</Text>
        <RoundedBox args={[1.28, 0.96, 0.025]} radius={0.045} smoothness={4} position={[0, 0.38, -0.01]}>
          <meshStandardMaterial color="#020617" roughness={0.8} name="Scan · Viewfinder" />
        </RoundedBox>
        {videoTexture && !result && (
          <mesh position={[0, 0.38, 0.012]}>
            <planeGeometry args={[1.22, 0.9]} />
            <meshBasicMaterial map={videoTexture} toneMapped={false} />
          </mesh>
        )}
        {!ready && !result && (
          <Text position={[0, 0.42, 0.02]} fontSize={0.045} color={error ? '#fda4af' : '#67e8f9'} anchorX="center" maxWidth={1.08} textAlign="center">
            {(error || 'REQUESTING CAMERA…').toUpperCase()}
          </Text>
        )}
        {ready && !result && (
          <group position={[0, 0.38, 0.025]}>
            {([-1, 1] as const).map(x => ([-1, 1] as const).map(y => (
              <group key={`${x}-${y}`} position={[x * 0.45, y * 0.31, 0]}>
                <mesh position={[-x * 0.06, 0, 0]}><planeGeometry args={[0.16, 0.015]} /><meshBasicMaterial color="#22d3ee" /></mesh>
                <mesh position={[0, -y * 0.06, 0]}><planeGeometry args={[0.015, 0.16]} /><meshBasicMaterial color="#22d3ee" /></mesh>
              </group>
            )))}
          </group>
        )}
        {result?.payload.type === 'address' && (
          <group>
            <Text position={[0, 0.55, 0.02]} fontSize={0.055} color={valid ? '#34d399' : '#fda4af'} anchorX="center">
              {valid ? 'ADDRESS VERIFIED' : 'ADDRESS / NETWORK MISMATCH'}
            </Text>
            <Text position={[0, 0.36, 0.02]} fontSize={0.042} color="#e2e8f0" anchorX="center">{truncateAddress(result.payload.address, 12, 10)}</Text>
            <Text position={[0, 0.2, 0.02]} fontSize={0.035} color={knownNetwork ? XR_THEME.muted : '#fda4af'} anchorX="center">
              {knownNetwork ? scannedChain.toUpperCase() : `UNSUPPORTED NETWORK ${scannedChainId}`}
            </Text>
          </group>
        )}
        {result?.payload.type === 'contract' && (
          <Text position={[0, 0.38, 0.02]} fontSize={0.043} color="#fbbf24" anchorX="center" maxWidth={1.1} textAlign="center">
            CONTRACT QR DETECTED. USE CONTRACTS TO IMPORT IT; NO FUNDS WILL BE SENT.
          </Text>
        )}
        <Text position={[0, -0.2, 0]} fontSize={0.034} color={error ? '#fda4af' : XR_THEME.muted} anchorX="center" maxWidth={1.25} textAlign="center">
          {result ? 'REVIEW THE ADDRESS BEFORE CONTINUING' : 'CENTER A WALLET QR INSIDE THE FRAME'}
        </Text>
        {result?.payload.type === 'address' ? (
          <Button3D label="USE IN SEND FLOW  ↗" onPress={() => onAddress(result.payload.type === 'address' ? result.payload.address : '', scannedChain)} position={[0, -0.48, 0]} width={1.14} height={0.21} fontSize={0.043} color="#059669" disabled={!valid} />
        ) : (
          <Button3D label={error ? 'RETRY CAMERA' : 'SCANNING…'} onPress={restart} position={[0, -0.48, 0]} width={1.14} height={0.21} fontSize={0.043} color="#0891b2" disabled={!error} />
        )}
        {result && <Button3D label="SCAN AGAIN" onPress={restart} position={[0, -0.75, 0]} width={1.14} height={0.18} fontSize={0.04} />}
        <Button3D label="CLOSE / STOP CAMERA" onPress={onClose} position={[0, -1.08, 0]} width={1.14} height={0.18} fontSize={0.038} color="#475569" />
      </group>
    </group>
  );
}
