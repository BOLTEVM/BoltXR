'use client';

import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import Webcam from 'react-webcam';
import { CameraOff } from 'lucide-react';
import { useMediaPipe, type Results } from '../hooks/useMediaPipe';
import HUDSystem, { type HandMode, type Tone } from './HUDSystem';
import InteractionSystem from './InteractionSystem';
import WalletOverlaySystem from './WalletOverlaySystem';
import QRPanel from './QRPanel';
import ContractManager from './ContractManager';
import VaultDialog from './VaultDialog';
import SendDialog from './SendDialog';
import { useSettings, getSetting } from '../hooks/useSettings';
import { useWallet } from '../hooks/useWallet';
import { WALLET_BUTTONS, PLAYGROUND_BUTTONS, Rect } from '../lib/constants';
import { GestureEngine, type GestureState, type Size, type Zone } from '../lib/gesture-engine';
import { drawHands, clearCanvas, fitCanvasToViewport } from '../lib/hand-drawing';
import { lovense } from '../lib/lovense';

type CameraState = 'pending' | 'ready' | 'denied';

interface GestureView {
  pinching: boolean;
  handCount: number;
  hoveredButton: number | null;
  hoveredClose: string | null;
  draggingIndex: number | null;
  scalingIndex: number | null;
}

const IDLE_GESTURE: GestureView = {
  pinching: false, handCount: 0, hoveredButton: null, hoveredClose: null, draggingIndex: null, scalingIndex: null,
};

const sameGesture = (a: GestureView, b: GestureState) =>
  a.pinching === b.pinching && a.handCount === b.handCount && a.hoveredButton === b.hoveredButton &&
  a.hoveredClose === b.hoveredClose && a.draggingIndex === b.draggingIndex && a.scalingIndex === b.scalingIndex;

/** Lay out gesture buttons in a centered row (or a 2×2 grid on narrow screens). */
function computeLayout(count: number, vw: number, vh: number): Rect[] {
  const gap = 20;
  const cols = vw >= 760 ? count : 2;
  const rows = Math.ceil(count / cols);
  const w = Math.min(180, (vw - 32 - (cols - 1) * gap) / cols);
  const h = 64;
  const totalW = cols * w + (cols - 1) * gap;
  const startX = (vw - totalW) / 2;
  const startY = vh - 88 - rows * h - (rows - 1) * gap;
  return Array.from({ length: count }, (_, i) => ({
    x: startX + (i % cols) * (w + gap),
    y: startY + Math.floor(i / cols) * (h + gap),
    w,
    h,
  }));
}

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

const HandTrackWallet: React.FC<{ onExit: () => void }> = ({ onExit }) => {
  const { setShowSettings, showSettings, modelComplexity } = useSettings();
  const wallet = useWallet();
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modalCloseRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  // react-webcam owns the stream; MediaPipe reads frames from its <video>.
  const videoRef = useMemo(() => ({
    get current() { return webcamRef.current?.video ?? null; },
  }), []);
  const [engine] = useState(() => new GestureEngine());

  const [mode, setMode] = useState<HandMode>('wallet');
  const activeButtons = mode === 'wallet' ? WALLET_BUTTONS : PLAYGROUND_BUTTONS;
  const [buttonRects, setButtonRects] = useState<Rect[]>(() =>
    computeLayout(WALLET_BUTTONS.length, window.innerWidth, window.innerHeight));
  const [camera, setCamera] = useState<CameraState>('pending');
  const [gesture, setGesture] = useState<GestureView>(IDLE_GESTURE);

  // Gesture overlays
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownAnchor, setDropdownAnchor] = useState<Rect | null>(null);
  const [toasts, setToasts] = useState<{ id: number; message: string; color: string }[]>([]);
  const toastIdRef = useRef(0);

  // Dialogs
  const [vaultOpen, setVaultOpen] = useState(false);
  const [send, setSend] = useState<{ open: boolean; to?: string; chainKey?: string }>({ open: false });
  const [qr, setQr] = useState<{ open: boolean; tab: 'receive' | 'scan'; forSend?: boolean }>({ open: false, tab: 'receive' });
  const [contracts, setContracts] = useState<{ open: boolean; payload?: string | null }>({ open: false });
  const dialogOpen = vaultOpen || send.open || qr.open || contracts.open || showSettings;

  // Prompt for the vault once when entering the stack locked.
  const [autoPrompted, setAutoPrompted] = useState(false);
  if (!autoPrompted && (wallet.status === 'locked' || wallet.status === 'no-vault')) {
    setAutoPrompted(true);
    setVaultOpen(true);
  }

  useEffect(() => {
    const onResize = () => {
      setButtonRects(computeLayout(activeButtons.length, window.innerWidth, window.innerHeight));
      if (canvasRef.current) fitCanvasToViewport(canvasRef.current);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [activeButtons.length]);

  const fireToast = useCallback((message: string, color: string) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev.slice(-3), { id, message, color }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200);
  }, []);

  const changeMode = useCallback((next: HandMode) => {
    setMode(next);
    setModalOpen(false);
    setDrawerOpen(false);
    setDropdownOpen(false);
    const count = (next === 'wallet' ? WALLET_BUTTONS : PLAYGROUND_BUTTONS).length;
    setButtonRects(computeLayout(count, window.innerWidth, window.innerHeight));
  }, []);

  const activateButton = useCallback((i: number) => {
    const def = activeButtons[i];
    if (!def) return;
    const locked = wallet.status !== 'unlocked';
    if (mode === 'wallet' && locked) {
      setVaultOpen(true);
      return;
    }
    switch (def.action) {
      case 'modal': setModalOpen(true); break;
      case 'drawer':
        if (mode === 'wallet') wallet.refreshHistory();
        setDrawerOpen(true);
        break;
      case 'dropdown':
        setDropdownAnchor(buttonRects[i]);
        setDropdownOpen(prev => !prev);
        break;
      case 'toast': fireToast(`${def.label} ACTIVATED`, def.color); break;
      case 'send': setSend({ open: true }); break;
      case 'receive': setQr({ open: true, tab: 'receive' }); break;
    }
  }, [activeButtons, buttonRects, fireToast, mode, wallet]);

  const handleClose = useCallback((id: string) => {
    if (id === 'modal') setModalOpen(false);
    if (id === 'drawer') setDrawerOpen(false);
    if (id === 'dropdown') setDropdownOpen(false);
  }, []);

  // Latest values for the per-frame gesture callback.
  const liveRef = useRef({ buttonRects, activateButton, handleClose, dialogOpen, overlayOpen: false, dropdownOpen });
  useEffect(() => {
    liveRef.current = {
      buttonRects,
      activateButton,
      handleClose,
      dialogOpen,
      overlayOpen: modalOpen || drawerOpen,
      dropdownOpen,
    };
  });

  const handleResults = useCallback((results: Results, frame: Size) => {
    const live = liveRef.current;
    const frames = (results.multiHandLandmarks || []).map((landmarks, i) => ({
      landmarks,
      label: results.multiHandedness?.[i]?.label,
    }));

    const canvas = canvasRef.current;
    if (canvas) {
      if (frames.length) drawHands(canvas, frames.map(f => f.landmarks), frame);
      else clearCanvas(canvas);
    }

    const vw = window.innerWidth, vh = window.innerHeight;
    const full = { x: 0, y: 0, w: vw, h: vh };
    const closeZones: Zone[] = [];
    const dismissZones: Zone[] = [];
    const modalClose = rectOf(modalCloseRef.current);
    const drawerClose = rectOf(drawerCloseRef.current);
    if (modalClose) closeZones.push({ id: 'modal', ...modalClose });
    if (drawerClose) closeZones.push({ id: 'drawer', ...drawerClose });
    const modalRect = rectOf(modalRef.current);
    const drawerRect = rectOf(drawerRef.current);
    const dropdownRect = rectOf(dropdownRef.current);
    if (modalRect) dismissZones.push({ id: 'modal', ...full, exclude: modalRect });
    if (drawerRect) dismissZones.push({ id: 'drawer', ...full, exclude: drawerRect });
    if (dropdownRect && live.dropdownOpen) dismissZones.push({ id: 'dropdown', ...full, exclude: dropdownRect });

    const update = engine.update(frames, frame, { width: vw, height: vh }, {
      // Buttons behind an open overlay are inert.
      buttons: live.overlayOpen ? [] : live.buttonRects,
      closeZones,
      dismissZones,
      paused: live.dialogOpen,
    });

    const cursor = cursorRef.current;
    if (cursor) {
      if (update.state.cursor) {
        cursor.style.display = 'block';
        cursor.style.left = `${update.state.cursor.x}px`;
        cursor.style.top = `${update.state.cursor.y}px`;
        cursor.classList.toggle('pinching', update.state.pinching);
        cursor.style.background = update.state.pinching ? '#f472b6' : '#22d3ee';
        cursor.style.boxShadow = update.state.pinching ? '0 0 16px 5px #f472b6' : '0 0 14px 4px #22d3ee';
      } else {
        cursor.style.display = 'none';
      }
    }

    if (update.rects) setButtonRects(update.rects);
    setGesture(prev => (sameGesture(prev, update.state) ? prev : {
      pinching: update.state.pinching,
      handCount: update.state.handCount,
      hoveredButton: update.state.hoveredButton,
      hoveredClose: update.state.hoveredClose,
      draggingIndex: update.state.draggingIndex,
      scalingIndex: update.state.scalingIndex,
    }));

    const haptics = getSetting('hapticsEnabled');
    for (const event of update.events) {
      if (event.type === 'pinch-start' && haptics) lovense.sendCommand('vibrate', 5);
      if (event.type === 'close') live.handleClose(event.id);
      if (event.type === 'activate') {
        if (haptics) {
          lovense.sendCommand('vibrate', 15);
          setTimeout(() => lovense.stopAll(), 200);
        }
        live.activateButton(event.index);
      }
    }
  }, [engine]);

  const { status: trackingStatus } = useMediaPipe(videoRef, { modelComplexity, onResults: handleResults });

  useEffect(() => () => { lovense.stopAll(); }, []);

  const tracking: { label: string; tone: Tone } = camera === 'denied'
    ? { label: 'Camera unavailable', tone: 'error' }
    : camera === 'pending'
    ? { label: 'Requesting camera…', tone: 'idle' }
    : trackingStatus === 'LOADING'
    ? { label: 'Loading hand model…', tone: 'warn' }
    : trackingStatus === 'ERROR'
    ? { label: 'Hand model failed to load', tone: 'error' }
    : trackingStatus === 'TRACKING'
    ? { label: `Tracking ${gesture.handCount || 1} hand${gesture.handCount > 1 ? 's' : ''}`, tone: 'ok' }
    : { label: 'Show your hand', tone: 'idle' };

  const interactionInfo = gesture.scalingIndex !== null
    ? `Resizing ${activeButtons[gesture.scalingIndex]?.label ?? ''}`
    : gesture.draggingIndex !== null
    ? `Moving ${activeButtons[gesture.draggingIndex]?.label ?? ''}`
    : '';

  const handleVaultClick = () => {
    if (wallet.status === 'unlocked') {
      wallet.lock();
      fireToast('VAULT LOCKED', '#fbbf24');
    } else {
      setVaultOpen(true);
    }
  };

  return (
    <div className="hand-track-root">
      <Webcam
        audio={false}
        ref={webcamRef}
        videoConstraints={{ facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }}
        onUserMedia={() => setCamera('ready')}
        onUserMediaError={() => setCamera('denied')}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          objectFit: 'cover',
          zIndex: 1,
          transform: 'scaleX(-1)',
        }}
        muted
        playsInline
      />

      <canvas ref={canvasRef} className="fixed inset-0 h-screen w-screen pointer-events-none z-10" aria-hidden />
      <div ref={cursorRef} className="cursor" style={{ display: 'none' }} aria-hidden />

      <HUDSystem
        trackingLabel={tracking.label}
        trackingTone={tracking.tone}
        pinching={gesture.pinching}
        interactionInfo={interactionInfo}
        mode={mode}
        onModeChange={changeMode}
        vaultStatus={wallet.status}
        onVaultClick={handleVaultClick}
        onExit={() => {
          lovense.stopAll();
          onExit();
        }}
        onOpenSettings={() => setShowSettings(true)}
        onOpenQR={() => setQr({ open: true, tab: 'receive' })}
        onOpenContracts={() => setContracts({ open: true })}
      />

      {camera === 'denied' && (
        <div className="fixed left-1/2 top-28 -translate-x-1/2 z-30 w-[min(420px,calc(100vw-32px))]">
          <div className="notice notice-danger items-start" role="alert">
            <CameraOff size={18} className="shrink-0 mt-0.5" />
            <span>
              Camera access is blocked, so hand tracking is off. Allow camera access and reload — or use your mouse; every control still works.
            </span>
          </div>
        </div>
      )}

      <InteractionSystem
        buttons={activeButtons}
        buttonRects={buttonRects}
        draggingIndex={gesture.draggingIndex}
        scalingIndex={gesture.scalingIndex}
        hoveredIndex={gesture.hoveredButton}
        onActivate={activateButton}
        disabled={modalOpen || drawerOpen}
      />

      <WalletOverlaySystem
        mode={mode}
        modalOpen={modalOpen}
        drawerOpen={drawerOpen}
        dropdownOpen={dropdownOpen}
        dropdownAnchor={dropdownAnchor}
        toasts={toasts}
        hoverClose={gesture.hoveredClose}
        onClose={handleClose}
        modalRef={modalRef}
        drawerRef={drawerRef}
        modalCloseRef={modalCloseRef}
        drawerCloseRef={drawerCloseRef}
        dropdownRef={dropdownRef}
      />

      <VaultDialog open={vaultOpen} onClose={() => setVaultOpen(false)} />

      <SendDialog
        open={send.open}
        initialTo={send.to}
        initialChainKey={send.chainKey}
        onClose={() => setSend({ open: false })}
        onRequestUnlock={() => setVaultOpen(true)}
        onScanRequest={() => {
          setSend(prev => ({ ...prev, open: false }));
          setQr({ open: true, tab: 'scan', forSend: true });
        }}
      />

      <QRPanel
        isOpen={qr.open}
        initialTab={qr.tab}
        onClose={() => setQr(prev => ({ ...prev, open: false }))}
        onRequestUnlock={() => setVaultOpen(true)}
        onAddressScanned={(address, chainKey) => {
          setQr(prev => ({ ...prev, open: false }));
          setSend({ open: true, to: address, chainKey });
        }}
        onContractScanned={(payload) => {
          setQr(prev => ({ ...prev, open: false }));
          setContracts({ open: true, payload });
        }}
      />

      <ContractManager
        isOpen={contracts.open}
        pendingPayload={contracts.payload}
        onPendingHandled={() => setContracts(prev => ({ ...prev, payload: null }))}
        onClose={() => setContracts({ open: false })}
        onRequestUnlock={() => setVaultOpen(true)}
        onOpenQRScanner={() => {
          setContracts({ open: false });
          setQr({ open: true, tab: 'scan' });
        }}
      />
    </div>
  );
};

export default HandTrackWallet;
