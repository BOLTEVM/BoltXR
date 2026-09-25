import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Rect } from '../lib/constants';
import type { HandMode } from './HUDSystem';
import TokenIcon from './ui/TokenIcon';
import { useWallet } from '@/hooks/useWallet';
import { CHAINS } from '@/lib/boltows/chains';
import { formatAmount, formatUsd, timeAgo, truncateAddress } from '@/lib/format';

interface Toast {
  id: number;
  message: string;
  color: string;
}

interface WalletOverlaySystemProps {
  mode: HandMode;
  modalOpen: boolean;
  drawerOpen: boolean;
  dropdownOpen: boolean;
  dropdownAnchor: Rect | null;
  toasts: Toast[];
  hoverClose: string | null;
  onClose: (id: string) => void;
  modalRef: React.RefObject<HTMLDivElement | null>;
  drawerRef: React.RefObject<HTMLDivElement | null>;
  modalCloseRef: React.RefObject<HTMLButtonElement | null>;
  drawerCloseRef: React.RefObject<HTMLButtonElement | null>;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
}

function CloseButton({ id, hover, color, onClose, innerRef }: {
  id: string; hover: boolean; color: string; onClose: (id: string) => void; innerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      type="button"
      ref={innerRef}
      onClick={() => onClose(id)}
      className="hand-close pointer-events-auto"
      aria-label="Close"
      style={{
        borderColor: hover ? color : undefined,
        color: hover ? color : undefined,
        background: hover ? `${color}22` : undefined,
        boxShadow: hover ? `0 0 16px ${color}66` : undefined,
      }}
    >
      ✕
    </button>
  );
}

function PortfolioBody() {
  const { tokens, totalUsd, status, refreshing } = useWallet();
  if (status !== 'unlocked') {
    return <p className="text-sm text-slate-400">Unlock your vault to see balances.</p>;
  }
  return (
    <>
      <div className="mb-4">
        <div className="section-title !mb-1">Total value</div>
        <div className="text-3xl font-bold">{formatUsd(totalUsd)}</div>
        {refreshing && <div className="mono text-[10px] text-slate-500 mt-1">Refreshing…</div>}
      </div>
      {tokens.map(t => (
        <div key={t.chainKey} className="hand-row">
          <span className="flex items-center gap-3 min-w-0">
            <TokenIcon symbol={t.symbol} color={t.color} size={30} />
            <span className="min-w-0">
              <span className="block text-sm font-bold truncate">{t.name}</span>
              <span className="block mono text-[10px] text-slate-500">{truncateAddress(t.address)}</span>
            </span>
          </span>
          <span className="text-right">
            {t.status === 'loading' ? (
              <span className="mono text-[11px] text-slate-500">Loading…</span>
            ) : t.status === 'error' ? (
              <span className="pill pill-danger" title={t.error}>Offline</span>
            ) : (
              <>
                <span className="block mono text-sm">{formatAmount(t.balance)} {t.symbol}</span>
                <span className="block text-[10px] text-slate-500">{t.usdValue !== undefined ? formatUsd(t.usdValue) : ''}</span>
              </>
            )}
          </span>
        </div>
      ))}
    </>
  );
}

function HistoryBody() {
  const { history, status } = useWallet();
  if (status !== 'unlocked') return <p className="text-sm text-slate-400">Unlock your vault to see activity.</p>;
  if (history.length === 0) return <p className="text-sm text-slate-400">No transactions sent from this device yet.</p>;
  return (
    <>
      {history.slice(0, 12).map(h => (
        <div key={h.hash} className="hand-row !items-start flex-col !gap-1">
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider">{h.type === 'contract_call' ? 'Contract call' : 'Sent'}</span>
            <span className={`pill ${h.status === 'success' ? 'pill-success' : h.status === 'failed' ? 'pill-danger' : 'pill-warning'}`}>{h.status}</span>
          </div>
          <div className="mono text-[11px] text-slate-300">{formatAmount(h.value)} {h.asset} → {truncateAddress(h.to)}</div>
          <div className="text-[10px] text-slate-500">{CHAINS[h.chainId]?.name || h.chainId} · {timeAgo(h.timestamp)}</div>
        </div>
      ))}
    </>
  );
}

const WalletOverlaySystem: React.FC<WalletOverlaySystemProps> = ({
  mode,
  modalOpen,
  drawerOpen,
  dropdownOpen,
  dropdownAnchor,
  toasts,
  hoverClose,
  onClose,
  modalRef,
  drawerRef,
  modalCloseRef,
  drawerCloseRef,
  dropdownRef,
}) => {
  const wallet = mode === 'wallet';
  return (
    <>
      <AnimatePresence>
        {(modalOpen || drawerOpen) && (
          <motion.div
            className="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { if (modalOpen) onClose('modal'); if (drawerOpen) onClose('drawer'); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {modalOpen && (
          <motion.div
            ref={modalRef}
            className="hand-modal"
            role="dialog"
            aria-label={wallet ? 'Portfolio' : 'Modal dialog'}
            initial={{ opacity: 0, scale: 0.9, x: '-50%', y: '-40%' }}
            animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
            exit={{ opacity: 0, scale: 0.9, x: '-50%', y: '-40%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            <div className="hand-panel-header">
              <span className="hand-panel-title text-cyan-300">◈ {wallet ? 'PORTFOLIO' : 'MODAL DIALOG'}</span>
              <CloseButton id="modal" hover={hoverClose === 'modal'} color="#22d3ee" onClose={onClose} innerRef={modalCloseRef} />
            </div>
            <div className="hand-panel-body">
              {wallet ? <PortfolioBody /> : (
                <div className="text-sm text-slate-400 leading-loose">
                  <p className="mono text-[11px] text-cyan-300/80 mb-3">TEMPLATE · MODAL COMPONENT</p>
                  <p>A gesture-driven modal. Pinch the <span className="text-cyan-300">✕</span> or tap outside to dismiss.</p>
                </div>
              )}
            </div>
            <div className="hand-panel-footer">PINCH ✕ OR TAP OUTSIDE TO CLOSE</div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            ref={drawerRef}
            className="hand-drawer"
            role="dialog"
            aria-label={wallet ? 'Activity' : 'Side panel'}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="hand-panel-header">
              <span className="hand-panel-title text-pink-300">⧖ {wallet ? 'ACTIVITY' : 'SIDE PANEL'}</span>
              <CloseButton id="drawer" hover={hoverClose === 'drawer'} color="#f472b6" onClose={onClose} innerRef={drawerCloseRef} />
            </div>
            <div className="hand-panel-body overflow-y-auto">
              {wallet ? <HistoryBody /> : ['NAVIGATION', 'SETTINGS', 'PROFILE', 'DATA STREAM', 'SYSTEM'].map((item, i) => (
                <div key={item} className="hand-row">
                  <span className="mono text-[9px] tracking-[0.25em] text-pink-300">ITEM {String(i + 1).padStart(2, '0')}</span>
                  <span className="text-xs tracking-wider text-slate-300">{item}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dropdownOpen && dropdownAnchor && (
          <motion.div
            ref={dropdownRef}
            className="dropdown"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            style={{
              left: Math.max(8, dropdownAnchor.x),
              bottom: Math.max(8, window.innerHeight - dropdownAnchor.y + 10),
              width: Math.max(180, dropdownAnchor.w),
            }}
          >
            {['Option Alpha', 'Option Beta', 'Option Gamma', 'Option Delta'].map(item => (
              <div key={item} className="dropdown-item">
                {item}
                <span className="h-1 w-1 rounded-full bg-amber-300" />
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="toast-stack" role="status" aria-live="polite">
        <AnimatePresence>
          {toasts.map(({ id, message, color }) => (
            <motion.div
              key={id}
              className="toast"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{ color, borderColor: `${color}88`, boxShadow: `0 0 20px ${color}33` }}
            >
              ◎ {message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
};

export default WalletOverlaySystem;
