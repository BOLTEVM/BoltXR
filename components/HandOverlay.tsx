import React, { useEffect } from 'react';
import { Results, HAND_CONNECTIONS } from '@mediapipe/hands';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

interface HandOverlayProps {
  results: Results | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  cursorPos: { x: number; y: number };
  pinching: boolean;
}

const HandOverlay: React.FC<HandOverlayProps> = ({ results, canvasRef, cursorPos, pinching }) => {
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas || !results) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const detected = results.multiHandLandmarks ?? [];
    const HAND_COLORS = [
      { connector: 'rgba(0, 255, 224, 0.8)', landmark: '#ff6af5', glow: '#00ffe0' },
      { connector: 'rgba(255, 233, 74, 0.8)', landmark: '#ff9f43', glow: '#ffe94a' },
    ];

    detected.forEach((landmarks, hi) => {
      const col = HAND_COLORS[hi % 2];

      ctx.save();
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
      
      ctx.shadowBlur = 14;
      ctx.shadowColor = col.glow;
      drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: col.connector, lineWidth: 2 });
      
      ctx.shadowBlur = 0;
      drawLandmarks(ctx, landmarks, { color: col.landmark, lineWidth: 1, radius: 4 });
      
      ctx.restore();
    });
  }, [results, canvasRef]);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 10,
          pointerEvents: 'none',
        }}
      />
      {cursorPos.x > 0 && cursorPos.y > 0 && (
        <div
          className={`cursor${pinching ? ' pinching' : ''}`}
          style={{
            left: cursorPos.x,
            top: cursorPos.y,
            background: pinching ? '#ff6af5' : '#00ffe0',
            boxShadow: pinching ? '0 0 16px 5px #ff6af5' : '0 0 14px 4px #00ffe0',
          }}
        />
      )}
    </>
  );
};

export default HandOverlay;
