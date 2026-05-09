import React from 'react';

interface HUDSystemProps {
  status: string;
  pinching: boolean;
  interactionInfo: string;
  cursorPos: { x: number; y: number };
  isFramework: boolean;
  onToggleMode: () => void;
  onExit: () => void;
}

const HUDSystem: React.FC<HUDSystemProps> = ({
  status,
  pinching,
  interactionInfo,
  cursorPos,
  isFramework,
  onToggleMode,
  onExit,
}) => {
  return (
    <>
      <div className="scan-line" />
      <div className="vignette" />
      
      <div className="title-hud">
        HAND · INTERFACE · v2.0
        <div className="mode-toggle" onClick={(e) => { e.stopPropagation(); onToggleMode(); }}>
          MODE: {isFramework ? 'LOGIC FRAMEWORK' : 'GENERIC FIELD'}
          <span className="toggle-hint"> (CLICK TO SWITCH)</span>
        </div>
        <div className="exit-button" onClick={(e) => { e.stopPropagation(); onExit(); }}>
          [ EXIT INTERFACE ]
        </div>
      </div>

      <div className="hud" style={{ top: 20, left: 20 }}>
        SYS ONLINE<br />
        CAM ACTIVE<br />
        {status}
      </div>

      <div className="hud" style={{ top: 20, right: 20, textAlign: 'right' }}>
        PINCH = TAP / DRAG<br />
        {pinching ? '● PINCHING' : '○ IDLE'}<br />
        {interactionInfo}
      </div>

      <div className="status-bar">
        CURSOR · {Math.round(cursorPos.x)}, {Math.round(cursorPos.y)}
        &nbsp;|&nbsp; {status}
      </div>

      <style jsx>{`
        .mode-toggle {
          margin-top: 8px;
          font-family: 'Space Mono', monospace;
          font-size: 9px;
          letter-spacing: 0.1em;
          color: rgba(0, 255, 224, 0.6);
          cursor: pointer;
          pointer-events: auto;
          transition: color 0.2s;
        }
        .mode-toggle:hover {
          color: #00ffe0;
        }
        .exit-button {
          margin-top: 12px;
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.2em;
          color: rgba(255, 255, 255, 0.3);
          cursor: pointer;
          pointer-events: auto;
          transition: all 0.2s;
          text-decoration: underline;
        }
        .exit-button:hover {
          color: #ff6af5;
          letter-spacing: 0.3em;
        }
        .toggle-hint {
          opacity: 0.4;
          font-size: 8px;
        }
      `}</style>
    </>
  );
};

export default HUDSystem;
