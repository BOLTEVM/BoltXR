'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, QrCode, ScanLine, Smartphone } from 'lucide-react';
import { generateAddressQR, parseQRPayload, QRPayload } from '@/lib/qr-codec';
import { useQRScanner } from '@/hooks/useQRScanner';

interface QRPanelProps {
  address: string | null;
  chainId?: string;
  isOpen: boolean;
  onClose: () => void;
  onAddressScanned?: (address: string, chainId?: string) => void;
  onContractScanned?: (rawPayload: string) => void;
}

type TabType = 'receive' | 'scan';

const QRPanel: React.FC<QRPanelProps> = ({
  address, chainId = 'ethereum', isOpen, onClose,
  onAddressScanned, onContractScanned,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('receive');
  const [qrDataUri, setQrDataUri] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [scanActive, setScanActive] = useState(false);
  const [scanResult, setScanResult] = useState<QRPayload | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { scannedData, reset: resetScanner } = useQRScanner(videoRef, scanActive);

  useEffect(() => {
    if (address) {
      generateAddressQR(address, { eip681: true, chainId, size: 280 })
        .then(setQrDataUri).catch(() => setQrDataUri(null));
    }
  }, [address, chainId]);

  useEffect(() => {
    if (scannedData) {
      const payload = parseQRPayload(scannedData.data);
      if (payload) {
        setScanResult(payload);
        setScanActive(false);
        if (payload.type === 'address' && onAddressScanned) onAddressScanned(payload.address, payload.chainId);
        else if (payload.type === 'contract' && onContractScanned) onContractScanned(scannedData.data);
      }
    }
  }, [scannedData, onAddressScanned, onContractScanned]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setScanActive(true); setScanResult(null); resetScanner();
    } catch { console.error('Camera access denied'); }
  }, [resetScanner]);

  const stopCamera = useCallback(() => {
    setScanActive(false);
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  }, []);

  useEffect(() => { if (!isOpen) { stopCamera(); setActiveTab('receive'); setScanResult(null); } }, [isOpen, stopCamera]);

  const handleCopy = useCallback(() => {
    if (address) { navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }, [address]);

  const truncAddr = address ? `${address.substring(0, 10)}...${address.substring(address.length - 8)}` : '';
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div className="qrp-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.div className="qrp-card" initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}>
          <div className="qrp-header">
            <div className="flex items-center gap-3"><QrCode className="text-purple-400 h-5 w-5" /><span className="text-xl font-bold tracking-tight">QR TERMINAL</span></div>
            <button onClick={onClose} className="qrp-close"><X size={20} /></button>
          </div>
          <div className="qrp-tabs">
            <button className={`qrp-tab ${activeTab === 'receive' ? 'active' : ''}`} onClick={() => { setActiveTab('receive'); stopCamera(); }}><Smartphone size={12} /> RECEIVE</button>
            <button className={`qrp-tab ${activeTab === 'scan' ? 'active' : ''}`} onClick={() => { setActiveTab('scan'); startCamera(); }}><ScanLine size={12} /> SCAN</button>
          </div>
          <div className="qrp-body">
            {activeTab === 'receive' && (
              <div className="qrp-recv">
                {qrDataUri ? (<div className="qrp-qr-wrap"><img src={qrDataUri} alt="Wallet QR" className="qrp-qr-img" /></div>) : (<div className="qrp-placeholder"><QrCode size={48} className="text-gray-600" /><p>CONNECT WALLET TO GENERATE QR</p></div>)}
                {address && (<div className="qrp-addr" onClick={handleCopy}><span className="qrp-addr-text">{truncAddr}</span>{copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} className="text-gray-400" />}</div>)}
                <p className="qrp-hint">Scan this QR code from any wallet to send assets to this address.</p>
              </div>
            )}
            {activeTab === 'scan' && (
              <div className="qrp-scan">
                <div className="qrp-viewport"><video ref={videoRef} className="qrp-video" playsInline muted />{scanActive && (<div className="qrp-scan-ol"><motion.div className="qrp-scan-line" animate={{ y: [0, 200, 0] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }} /></div>)}</div>
                {scanResult && (<motion.div className="qrp-result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>{scanResult.type === 'address' ? (<><div className="qrp-badge addr">ADDRESS</div><span className="qrp-result-val">{scanResult.address.substring(0, 16)}...</span></>) : (<><div className="qrp-badge contract">CONTRACT</div><span className="qrp-result-val">{scanResult.name}</span></>)}</motion.div>)}
                {!scanActive && !scanResult && (<button className="qrp-start-btn" onClick={startCamera}><ScanLine size={16} /> START SCANNER</button>)}
              </div>
            )}
          </div>
          <div className="qrp-footer">BOLT XR · QR TERMINAL · EIP-681 COMPATIBLE</div>
        </motion.div>
        <style jsx>{`
          .qrp-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(12px);z-index:1000;display:flex;align-items:center;justify-content:center}
          .qrp-card{width:380px;background:rgba(15,15,20,0.95);border:1px solid rgba(255,255,255,0.1);box-shadow:0 40px 100px rgba(0,0,0,0.8),0 0 40px rgba(168,85,247,0.1);border-radius:24px;overflow:hidden;color:white}
          .qrp-header{padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:space-between}
          .qrp-close{color:rgba(255,255,255,0.4);transition:color 0.2s}.qrp-close:hover{color:white}
          .qrp-tabs{display:flex;padding:0 24px;gap:8px;border-bottom:1px solid rgba(255,255,255,0.05)}
          .qrp-tab{flex:1;padding:12px;font-size:10px;font-weight:800;letter-spacing:0.15em;color:rgba(255,255,255,0.4);border-bottom:2px solid transparent;transition:all 0.2s;display:flex;align-items:center;justify-content:center;gap:6px}
          .qrp-tab:hover{color:rgba(255,255,255,0.7)}.qrp-tab.active{color:#a855f7;border-bottom-color:#a855f7}
          .qrp-body{padding:24px;min-height:340px}
          .qrp-recv{display:flex;flex-direction:column;align-items:center;gap:16px}
          .qrp-qr-wrap{padding:16px;background:rgba(15,23,42,0.8);border:1px solid rgba(168,85,247,0.3);border-radius:16px;box-shadow:0 0 30px rgba(168,85,247,0.1)}
          .qrp-qr-img{width:240px;height:240px;image-rendering:pixelated}
          .qrp-placeholder{width:240px;height:240px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;border:2px dashed rgba(255,255,255,0.1);border-radius:16px;color:rgba(255,255,255,0.3);font-size:10px;letter-spacing:0.1em}
          .qrp-addr{display:flex;align-items:center;gap:8px;padding:8px 16px;background:rgba(255,255,255,0.05);border-radius:8px;cursor:pointer;transition:background 0.2s}.qrp-addr:hover{background:rgba(255,255,255,0.1)}
          .qrp-addr-text{font-family:'Space Mono',monospace;font-size:11px;color:rgba(255,255,255,0.7)}
          .qrp-hint{font-size:10px;color:rgba(255,255,255,0.3);text-align:center;max-width:260px}
          .qrp-scan{display:flex;flex-direction:column;align-items:center;gap:16px}
          .qrp-viewport{width:280px;height:220px;border-radius:16px;overflow:hidden;position:relative;background:#000;border:1px solid rgba(168,85,247,0.3)}
          .qrp-video{width:100%;height:100%;object-fit:cover}
          .qrp-scan-ol{position:absolute;inset:20px;border:2px solid rgba(168,85,247,0.5);border-radius:8px;overflow:hidden}
          .qrp-scan-line{width:100%;height:2px;background:linear-gradient(90deg,transparent,#a855f7,transparent);position:absolute;top:0}
          .qrp-result{display:flex;align-items:center;gap:8px;padding:10px 16px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:8px}
          .qrp-badge{font-size:8px;font-weight:800;padding:2px 6px;border-radius:4px;letter-spacing:0.1em}
          .qrp-badge.addr{background:rgba(96,165,250,0.2);color:#60a5fa}.qrp-badge.contract{background:rgba(168,85,247,0.2);color:#a855f7}
          .qrp-result-val{font-family:'Space Mono',monospace;font-size:11px;color:white}
          .qrp-start-btn{display:flex;align-items:center;gap:8px;padding:12px 24px;background:rgba(168,85,247,0.2);border:1px solid rgba(168,85,247,0.4);border-radius:12px;color:#a855f7;font-size:10px;font-weight:800;letter-spacing:0.1em;cursor:pointer;transition:all 0.2s}.qrp-start-btn:hover{background:rgba(168,85,247,0.3);transform:scale(1.02)}
          .qrp-footer{padding:12px 24px;background:rgba(0,0,0,0.3);font-size:8px;letter-spacing:0.3em;color:rgba(255,255,255,0.15);text-align:center}
        `}</style>
      </motion.div>
    </AnimatePresence>
  );
};

export default QRPanel;
