'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { Copy, Check, QrCode, ScanLine, Smartphone, CameraOff, Send, FileCode2, RotateCcw } from 'lucide-react';
import Dialog from './ui/Dialog';
import TokenIcon from './ui/TokenIcon';
import { generateAddressQR, parseQRPayload, QRPayload } from '@/lib/qr-codec';
import { useQRScanner } from '@/hooks/useQRScanner';
import { useWallet } from '@/hooks/useWallet';
import { CHAINS, resolveChainKey } from '@/lib/boltows/chains';

interface QRPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: TabType;
  onAddressScanned?: (address: string, chainKey?: string) => void;
  onContractScanned?: (rawPayload: string) => void;
  onRequestUnlock?: () => void;
}

type TabType = 'receive' | 'scan';

const cameraErrorMessage = (e: unknown) => {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera permission was denied. Allow camera access in your browser to scan.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device.';
  if (name === 'NotReadableError') return 'The camera is in use by another application.';
  return 'Could not start the camera.';
};

const QRPanel: React.FC<QRPanelProps> = ({
  isOpen, onClose, initialTab = 'receive', onAddressScanned, onContractScanned, onRequestUnlock,
}) => {
  const { addresses, tokens, status } = useWallet();
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [chainKey, setChainKey] = useState('ethereum');
  const [qrDataUri, setQrDataUri] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [scanResult, setScanResult] = useState<{ payload: QRPayload; raw: string } | null>(null);
  // Each camera start is an "attempt"; readiness/errors are tied to the attempt they belong to.
  const [attempt, setAttempt] = useState(0);
  const [readyAttempt, setReadyAttempt] = useState<number | null>(null);
  const [cameraFailure, setCameraFailure] = useState<{ attempt: number; message: string } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const wantCamera = isOpen && activeTab === 'scan' && !scanResult;
  const scanActive = wantCamera && readyAttempt === attempt;
  const cameraError = wantCamera && cameraFailure?.attempt === attempt ? cameraFailure.message : null;
  const { scannedData, reset: resetScanner } = useQRScanner(videoRef, scanActive);

  const address = addresses[chainKey] || null;
  const chain = CHAINS[chainKey];

  // Reset per-open state
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setActiveTab(initialTab);
      setScanResult(null);
    }
  }

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    generateAddressQR(address, { eip681: true, chainId: chainKey, size: 280 })
      .then(uri => { if (!cancelled) setQrDataUri(uri); })
      .catch(() => { if (!cancelled) setQrDataUri(null); });
    return () => { cancelled = true; };
  }, [address, chainKey]);

  // Own the camera stream for as long as scanning is wanted.
  useEffect(() => {
    if (!wantCamera) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    const video = videoRef.current;

    if (!navigator.mediaDevices?.getUserMedia) {
      Promise.resolve().then(() => {
        if (!cancelled) setCameraFailure({ attempt, message: 'Camera access is not available in this browser.' });
      });
      return () => { cancelled = true; };
    }

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(async s => {
        // The panel may have closed (or restarted) while the permission prompt was open.
        if (cancelled) {
          s.getTracks().forEach(t => t.stop());
          return;
        }
        stream = s;
        if (video) {
          video.srcObject = s;
          await video.play().catch(() => undefined);
        }
        if (!cancelled) setReadyAttempt(attempt);
      })
      .catch(e => {
        if (!cancelled) setCameraFailure({ attempt, message: cameraErrorMessage(e) });
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach(t => t.stop());
      if (video) video.srcObject = null;
    };
  }, [wantCamera, attempt]);

  const restartScan = useCallback(() => {
    resetScanner();
    setScanResult(null);
    setAttempt(a => a + 1);
  }, [resetScanner]);

  // Handle a decoded frame
  const [lastHandled, setLastHandled] = useState<number | null>(null);
  if (scannedData && scannedData.timestamp !== lastHandled) {
    setLastHandled(scannedData.timestamp);
    const payload = parseQRPayload(scannedData.data);
    if (payload) setScanResult({ payload, raw: scannedData.data });
  }

  const handleCopy = useCallback(async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [address]);

  const receiveChains = tokens.length ? tokens.map(t => t.chainKey) : Object.keys(addresses);
  const scannedChainKey = scanResult?.payload.type === 'address' ? resolveChainKey(scanResult.payload.chainId) : null;

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      size="sm"
      icon={<QrCode className="text-purple-400 h-5 w-5" />}
      title="QR Terminal"
      footer="EIP-681 · BIP-21 · boltxr:// contracts"
      toolbar={
        <div className="tabs" role="tablist">
          <button type="button" role="tab" className="tab" aria-selected={activeTab === 'receive'} onClick={() => setActiveTab('receive')}>
            <Smartphone size={12} /> RECEIVE
          </button>
          <button type="button" role="tab" className="tab" aria-selected={activeTab === 'scan'} onClick={() => setActiveTab('scan')}>
            <ScanLine size={12} /> SCAN
          </button>
        </div>
      }
    >
      {activeTab === 'receive' && (
        <div className="flex flex-col items-center gap-4">
          {status !== 'unlocked' ? (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <QrCode size={48} className="text-slate-600" />
              <p className="text-sm text-slate-400 max-w-[240px]">Unlock your vault to show your receive address.</p>
              {onRequestUnlock && <button type="button" className="btn btn-primary" onClick={onRequestUnlock}>Unlock vault</button>}
            </div>
          ) : (
            <>
              <label className="w-full">
                <span className="field-label">Network</span>
                <select className="input" value={chainKey} onChange={e => setChainKey(e.target.value)}>
                  {receiveChains.map(key => (
                    <option key={key} value={key}>{CHAINS[key]?.name} ({CHAINS[key]?.nativeCurrency.symbol})</option>
                  ))}
                </select>
              </label>
              <div className="rounded-2xl bg-white p-3 shadow-[0_0_30px_rgba(168,85,247,0.15)]">
                {qrDataUri && address ? (
                  <Image src={qrDataUri} alt={`QR code for your ${chain?.name} address`} width={220} height={220} unoptimized className="h-[220px] w-[220px] [image-rendering:pixelated]" />
                ) : (
                  <div className="h-[220px] w-[220px] flex items-center justify-center text-slate-400 text-xs">Generating…</div>
                )}
              </div>
              {address && (
                <button type="button" onClick={handleCopy} className="card w-full flex items-center justify-between gap-3 px-3 py-2.5 hover:border-white/20 transition-colors" aria-label="Copy address">
                  <span className="mono text-[11px] text-slate-300 break-all text-left">{address}</span>
                  {copied ? <Check size={16} className="text-emerald-400 shrink-0" /> : <Copy size={16} className="text-slate-400 shrink-0" />}
                </button>
              )}
              {chain && (
                <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                  Only send <strong className="text-slate-300">{chain.nativeCurrency.symbol}</strong>
                  {chain.kind === 'evm' ? ' or tokens' : ''} on <strong className="text-slate-300">{chain.name}</strong> to this address.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'scan' && (
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-black border border-purple-500/30">
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
            {scanActive && (
              <div className="absolute inset-5 border-2 border-purple-500/50 rounded-lg overflow-hidden pointer-events-none">
                <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-purple-400 to-transparent animate-[scan_2s_ease-in-out_infinite]" />
              </div>
            )}
            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center bg-black/80">
                <CameraOff className="text-slate-500" />
                <p className="text-xs text-slate-300">{cameraError}</p>
              </div>
            )}
          </div>

          {scanActive && !scanResult && (
            <p className="text-xs text-slate-400">Point the camera at a wallet or contract QR code.</p>
          )}

          {scanResult && (
            <div className="w-full flex flex-col gap-3">
              <div className="notice notice-success items-center">
                {scanResult.payload.type === 'address' ? (
                  <>
                    <span className="pill pill-info">Address</span>
                    <span className="mono text-[11px] break-all">{scanResult.payload.address}</span>
                  </>
                ) : (
                  <>
                    <span className="pill pill-brand">Contract</span>
                    <span className="text-sm font-bold">{scanResult.payload.name}</span>
                  </>
                )}
              </div>
              {scannedChainKey && CHAINS[scannedChainKey] && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <TokenIcon symbol={CHAINS[scannedChainKey].nativeCurrency.symbol} color={CHAINS[scannedChainKey].color} size={20} />
                  {CHAINS[scannedChainKey].name}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <button type="button" className="btn" onClick={restartScan}><RotateCcw size={14} /> Scan again</button>
                {scanResult.payload.type === 'address' && onAddressScanned && (
                  <button type="button" className="btn btn-primary" onClick={() => {
                    if (scanResult.payload.type === 'address') onAddressScanned(scanResult.payload.address, scannedChainKey || undefined);
                  }}>
                    <Send size={14} /> Send here
                  </button>
                )}
                {scanResult.payload.type === 'contract' && onContractScanned && (
                  <button type="button" className="btn btn-primary" onClick={() => onContractScanned(scanResult.raw)}>
                    <FileCode2 size={14} /> Import
                  </button>
                )}
              </div>
            </div>
          )}

          {!scanActive && !scanResult && cameraError && (
            <button type="button" className="btn btn-primary" onClick={restartScan}><ScanLine size={16} /> Try again</button>
          )}
        </div>
      )}
    </Dialog>
  );
};

export default QRPanel;
