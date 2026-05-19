'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { useMediaPipe } from '../hooks/useMediaPipe';
import { useHandInteractions } from '../hooks/useHandInteractions';
import HandOverlay from './HandOverlay';
import HUDSystem from './HUDSystem';
import InteractionSystem from './InteractionSystem';
import WalletOverlaySystem from './WalletOverlaySystem';
import QRPanel from './QRPanel';
import ContractManager from './ContractManager';
import { useSettings } from '../hooks/useSettings';
import { useWallet } from '../hooks/useWallet';
import { FRAMEWORK_BUTTONS, GENERIC_BUTTONS, Rect, ButtonDef } from '../lib/constants';
import { lovense } from '../lib/lovense';

const HandTrackWallet: React.FC<{ onExit: () => void }> = ({ onExit }) => {
  const { setShowSettings, modelComplexity } = useSettings();
  const { account } = useWallet();
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modalCloseRef = useRef<HTMLDivElement>(null);
  const drawerCloseRef = useRef<HTMLDivElement>(null);

  // State for modes
  const [isFramework, setIsFramework] = useState(true);
  const activeButtons = isFramework ? FRAMEWORK_BUTTONS : GENERIC_BUTTONS;

  // Interaction State
  const [buttonRects, setButtonRects] = useState<Rect[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownAnchor, setDropdownAnchor] = useState<Rect | null>(null);
  const [toasts, setToasts] = useState<{ id: number; message: string; color: string }[]>([]);
  const toastIdRef = useRef(0);

  // QR & Contract Panel State
  const [showQRPanel, setShowQRPanel] = useState(false);
  const [showContractManager, setShowContractManager] = useState(false);

  // Initialize button rects
  const computeInitialRects = useCallback((btns: ButtonDef[]) => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 720;
    const btnW = 160, btnH = 64, gap = 24;
    const total = btns.length * btnW + (btns.length - 1) * gap;
    const startX = (vw - total) / 2;
    const y = vh * 0.74;
    return btns.map((_, i) => ({ x: startX + i * (btnW + gap), y, w: btnW, h: btnH }));
  }, []);

  useEffect(() => {
    setButtonRects(computeInitialRects(activeButtons));
    const handleResize = () => setButtonRects(computeInitialRects(activeButtons));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeButtons, computeInitialRects]);

  // Actions
  const fireToast = useCallback((message: string, color: string) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, color }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200);
  }, []);

  const activateButton = useCallback((i: number) => {
    const { action, color, label } = activeButtons[i];
    if (action === 'modal') setModalOpen(true);
    if (action === 'drawer') setDrawerOpen(true);
    if (action === 'dropdown') {
      setDropdownAnchor(buttonRects[i]);
      setDropdownOpen(prev => !prev);
    }
    if (action === 'toast') fireToast(`${label} ACTIVATED`, color);
  }, [activeButtons, buttonRects, fireToast]);

  const handleClose = useCallback((id: string) => {
    if (id === 'modal') setModalOpen(false);
    if (id === 'drawer') setDrawerOpen(false);
    if (id === 'dropdown') setDropdownOpen(false);
  }, []);

  // Compute zone rects for hit-testing
  const [closeRects, setCloseRects] = useState<any[]>([]);
  const [dismissRects, setDismissRects] = useState<any[]>([]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const cz: any[] = [];
      const dz: any[] = [];
      const vw = window.innerWidth, vh = window.innerHeight;

      if (modalOpen && modalCloseRef.current) {
        const r = modalCloseRef.current.getBoundingClientRect();
        cz.push({ id: 'modal', x: r.left, y: r.top, w: r.width, h: r.height });
        dz.push({ id: 'modal', x: 0, y: 0, w: vw, h: vh });
      }
      if (drawerOpen && drawerCloseRef.current) {
        const r = drawerCloseRef.current.getBoundingClientRect();
        cz.push({ id: 'drawer', x: r.left, y: r.top, w: r.width, h: r.height });
        dz.push({ id: 'drawer', x: 0, y: 0, w: vw - 320, h: vh });
      }
      setCloseRects(cz);
      setDismissRects(dz);
    });
    return () => cancelAnimationFrame(id);
  }, [modalOpen, drawerOpen]);

  // Hooks
  const { results, status } = useMediaPipe(webcamRef as any, { modelComplexity });
  const interaction = useHandInteractions(
    results,
    canvasRef,
    buttonRects,
    setButtonRects,
    activateButton,
    closeRects,
    dismissRects,
    handleClose
  );

  return (
    <div className="hand-track-root">
      <Webcam
        audio={false}
        ref={webcamRef}
        videoConstraints={{ facingMode: 'user' }}
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

      <HandOverlay
        results={results}
        canvasRef={canvasRef}
        cursorPos={interaction.indexTip}
        pinching={interaction.pinching}
      />

      <HUDSystem
        status={status}
        pinching={interaction.pinching}
        interactionInfo={
            interaction.scalingIndex !== null 
            ? `⟺ SCALING BTN ${interaction.scalingIndex + 1}` 
            : interaction.draggingIndex !== null 
            ? `DRAGGING BTN ${interaction.draggingIndex + 1}` 
            : ""
        }
        cursorPos={interaction.indexTip}
        isFramework={isFramework}
        onToggleMode={() => setIsFramework(!isFramework)}
        onExit={() => {
          lovense.stopAll();
          onExit();
        }}
        onOpenSettings={() => setShowSettings(true)}
        onOpenQR={() => setShowQRPanel(true)}
        onOpenContracts={() => setShowContractManager(true)}
      />

      <InteractionSystem
        buttons={activeButtons}
        buttonRects={buttonRects}
        draggingIndex={interaction.draggingIndex}
        scalingIndex={interaction.scalingIndex}
      />

      <WalletOverlaySystem
        modalOpen={modalOpen}
        drawerOpen={drawerOpen}
        dropdownOpen={dropdownOpen}
        dropdownAnchor={dropdownAnchor}
        toasts={toasts}
        hoverClose={interaction.hoveredClose}
        onClose={handleClose}
        modalCloseRef={modalCloseRef}
        drawerCloseRef={drawerCloseRef}
      />

      {/* QR Panel Overlay (2D) */}
      <QRPanel
        address={account}
        isOpen={showQRPanel}
        onClose={() => setShowQRPanel(false)}
        onContractScanned={(payload) => {
          setShowQRPanel(false);
          setShowContractManager(true);
        }}
      />

      {/* Contract Manager Overlay (2D) */}
      <ContractManager
        chainId="ethereum"
        walletId={account}
        isOpen={showContractManager}
        onClose={() => setShowContractManager(false)}
        onOpenQRScanner={() => {
          setShowContractManager(false);
          setShowQRPanel(true);
        }}
      />
    </div>
  );
};

export default HandTrackWallet;
