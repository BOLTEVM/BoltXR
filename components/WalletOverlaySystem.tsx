import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Rect } from '../lib/constants';

interface Toast {
  id: number;
  message: string;
  color: string;
}

interface WalletOverlaySystemProps {
  modalOpen: boolean;
  drawerOpen: boolean;
  dropdownOpen: boolean;
  dropdownAnchor: Rect | null;
  toasts: Toast[];
  hoverClose: string | null;
  onClose: (id: string) => void;
  modalCloseRef: React.RefObject<HTMLDivElement | null>;
  drawerCloseRef: React.RefObject<HTMLDivElement | null>;
}

const WalletOverlaySystem: React.FC<WalletOverlaySystemProps> = ({
  modalOpen,
  drawerOpen,
  dropdownOpen,
  dropdownAnchor,
  toasts,
  hoverClose,
  onClose,
  modalCloseRef,
  drawerCloseRef,
}) => {
  return (
    <>
      <AnimatePresence>
        {(modalOpen || drawerOpen) && (
          <motion.div
            className="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {modalOpen && (
          <motion.div
            className="modal"
            initial={{ opacity: 0, scale: 0.9, x: '-50%', y: '-40%' }}
            animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
            exit={{ opacity: 0, scale: 0.9, x: '-50%', y: '-40%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            <div className="modal-header">
              <span className="modal-title">◈ MODAL DIALOG</span>
              <div
                ref={modalCloseRef}
                className="close-btn"
                style={{
                  borderColor: hoverClose === 'modal' ? '#00ffe0' : 'rgba(0, 255, 224, 0.3)',
                  color: '#00ffe0',
                  background: hoverClose === 'modal' ? 'rgba(0, 255, 224, 0.15)' : 'transparent',
                  boxShadow: hoverClose === 'modal' ? '0 0 16px rgba(0, 255, 224, 0.4)' : 'none',
                }}
              >
                ✕
              </div>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 16, color: 'rgba(0, 255, 224, 0.8)', fontSize: 11 }}>
                TEMPLATE · MODAL COMPONENT
              </p>
              <p>This is your base modal. Ported and refined for the Bolt XR ecosystem.</p>
              <p style={{ marginTop: 16 }}>Pinch the <span style={{ color: '#00ffe0' }}>✕</span> to dismiss.</p>
            </div>
            <div className="modal-footer">PINCH ✕ TO CLOSE &nbsp;·&nbsp; HAND INTERFACE v2.0</div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            className="drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="drawer-header">
              <span className="drawer-title">⬡ SIDE PANEL</span>
              <div
                ref={drawerCloseRef}
                className="close-btn"
                style={{
                  borderColor: hoverClose === 'drawer' ? '#ff6af5' : 'rgba(255, 106, 245, 0.3)',
                  color: '#ff6af5',
                  background: hoverClose === 'drawer' ? 'rgba(255, 106, 245, 0.15)' : 'transparent',
                  boxShadow: hoverClose === 'drawer' ? '0 0 16px rgba(255, 106, 245, 0.4)' : 'none',
                }}
              >
                ✕
              </div>
            </div>
            <div className="drawer-body">
              {['NAVIGATION', 'SETTINGS', 'PROFILE', 'DATA STREAM', 'SYSTEM'].map((item, i) => (
                <div key={i} className="drawer-item">
                  <div className="drawer-item-label">ITEM {String(i + 1).padStart(2, '0')}</div>
                  {item}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dropdownOpen && dropdownAnchor && (
          <motion.div
            className="dropdown"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            style={{
              left: dropdownAnchor.x,
              top: dropdownAnchor.y - 200, // Approx height
              width: dropdownAnchor.w,
            }}
          >
            {['Option Alpha', 'Option Beta', 'Option Gamma', 'Option Delta'].map((item, i) => (
              <div key={i} className="dropdown-item">
                <span className="dropdown-item-dot" />
                {item}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="toast-stack">
        <AnimatePresence>
          {toasts.map(({ id, message, color }) => (
            <motion.div
              key={id}
              className="toast"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{ color, borderColor: color, boxShadow: `0 0 20px ${color}33` }}
            >
              ◎ &nbsp;{message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
};

export default WalletOverlaySystem;
