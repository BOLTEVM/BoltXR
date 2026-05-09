import { useRef, useState, useCallback, useEffect } from 'react';
import { Results } from '@mediapipe/hands';

interface Point {
  x: number;
  y: number;
}

interface InteractionState {
  indexTip: Point;
  pinching: boolean;
  draggingIndex: number | null;
  scalingIndex: number | null;
  hoveredClose: string | null;
}

const TAP_MS = 350;
const TAP_MOVE_PX = 14;
const PINCH_THRESHOLD = 40;

export const useHandInteractions = (
  results: Results | null,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  buttonRects: any[],
  setButtonRects: (rects: any[]) => void,
  activateButton: (index: number) => void,
  closeRects: any[],
  dismissRects: any[],
  onClose: (id: string) => void
) => {
  const [state, setState] = useState<InteractionState>({
    indexTip: { x: 0, y: 0 },
    pinching: false,
    draggingIndex: null,
    scalingIndex: null,
    hoveredClose: null,
  });

  const prevTipRef = useRef<Point[]>([{ x: 0, y: 0 }, { x: 0, y: 0 }]);
  const dragRef = useRef<({ i: number; offX: number; offY: number } | null)[]>([null, null]);
  const pinchStartRef = useRef<({ time: number; x: number; y: number; hitClose?: string } | null)[]>([null, null]);
  const didDragRef = useRef<boolean[]>([false, false]);
  const scaleRef = useRef<{ i: number; initDist: number; initW: number; initH: number } | null>(null);

  useEffect(() => {
    if (!results || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const W = canvas.width;
    const H = canvas.height;
    const detected = results.multiHandLandmarks ?? [];

    if (!detected.length) {
      setState(s => ({ ...s, pinching: false, draggingIndex: null, scalingIndex: null }));
      dragRef.current = [null, null];
      pinchStartRef.current = [null, null];
      didDragRef.current = [false, false];
      scaleRef.current = null;
      return;
    }

    const handData: { sx: number; sy: number; isPinching: boolean }[] = [];
    let currentHoverClose: string | null = null;

    detected.forEach((landmarks, hi) => {
      const tip = landmarks[8];
      const thumb = landmarks[4];
      
      // Mirror and smooth coordinates
      const rawX = (1 - tip.x) * W;
      const rawY = tip.y * H;
      const prev = prevTipRef.current[hi] || { x: rawX, y: rawY };
      const sx = prev.x + (rawX - prev.x) * 0.4;
      const sy = prev.y + (rawY - prev.y) * 0.4;
      prevTipRef.current[hi] = { x: sx, y: sy };

      const tx = (1 - thumb.x) * W;
      const ty = thumb.y * H;
      const dist = Math.hypot(sx - tx, sy - ty);
      const isPinching = dist < PINCH_THRESHOLD;

      handData.push({ sx, sy, isPinching });

      // Hit-test close zones
      closeRects.forEach(({ id, x, y, w, h }) => {
        if (sx >= x && sx <= x + w && sy >= y && sy <= y + h) {
          currentHoverClose = id;
        }
      });
    });

    // Interaction Logic
    const anyPinching = handData.some(h => h.isPinching);
    const primaryHand = handData[0]; // For cursor position

    // Two-hand scale
    if (handData.length === 2 && handData[0].isPinching && handData[1].isPinching) {
      const { sx: x0, sy: y0 } = handData[0];
      const { sx: x1, sy: y1 } = handData[1];
      const currentDist = Math.hypot(x1 - x0, y1 - y0);

      const btnIdx0 = dragRef.current[0]?.i ?? -1;
      const btnIdx1 = dragRef.current[1]?.i ?? -1;
      const sharedBtn = btnIdx0 !== -1 && btnIdx0 === btnIdx1 ? btnIdx0 : -1;

      if (sharedBtn !== -1) {
        if (!scaleRef.current) {
          const r = buttonRects[sharedBtn];
          scaleRef.current = { i: sharedBtn, initDist: currentDist, initW: r.w, initH: r.h };
        } else {
          const { i, initDist, initW, initH } = scaleRef.current;
          const ratio = currentDist / initDist;
          const newW = Math.max(80, Math.min(400, initW * ratio));
          const newH = Math.max(40, Math.min(160, initH * ratio));
          const midX = (x0 + x1) / 2 - newW / 2;
          const midY = (y0 + y1) / 2 - newH / 2;

          const nextRects = buttonRects.map((r, j) =>
            j === i ? { ...r, x: midX, y: midY, w: newW, h: newH } : r
          );
          setButtonRects(nextRects);
        }
      }
    } else {
      scaleRef.current = null;
    }

    // Per-hand single drag / tap
    handData.forEach(({ sx, sy, isPinching }, hi) => {
      if (isPinching) {
        if (!pinchStartRef.current[hi]) {
          pinchStartRef.current[hi] = { time: Date.now(), x: sx, y: sy };
          didDragRef.current[hi] = false;

          // Check close hit
          let hitCloseId: string | undefined;
          closeRects.forEach(({ id, x, y, w, h }) => {
            if (sx >= x && sx <= x + w && sy >= y && sy <= y + h) {
              hitCloseId = id;
            }
          });
          if (hitCloseId) {
            pinchStartRef.current[hi]!.hitClose = hitCloseId;
          } else if (!scaleRef.current) {
            // Check button hit
            buttonRects.forEach((r, i) => {
              const otherHi = 1 - hi;
              if (dragRef.current[otherHi]?.i === i) return;
              if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) {
                dragRef.current[hi] = { i, offX: sx - r.x, offY: sy - r.y };
              }
            });
          }
        }

        // Drag update
        if (dragRef.current[hi] && !scaleRef.current) {
          const { i, offX, offY } = dragRef.current[hi]!;
          const moved = Math.hypot(sx - pinchStartRef.current[hi]!.x, sy - pinchStartRef.current[hi]!.y);
          if (moved > TAP_MOVE_PX) didDragRef.current[hi] = true;

          const nextRects = buttonRects.map((r, j) =>
            j === i ? { ...r, x: sx - offX, y: sy - offY } : r
          );
          setButtonRects(nextRects);
        }
      } else {
        // Release
        if (pinchStartRef.current[hi]) {
          const elapsed = Date.now() - pinchStartRef.current[hi]!.time;
          const wasTap = elapsed < TAP_MS && !didDragRef.current[hi];
          const hitClose = pinchStartRef.current[hi]!.hitClose;

          if (hitClose) {
            onClose(hitClose);
          } else if (wasTap) {
            // Check dismiss
            let dismissed = false;
            dismissRects.forEach(({ id, x, y, w, h }) => {
              if (sx >= x && sx <= x + w && sy >= y && sy <= y + h) {
                onClose(id);
                dismissed = true;
              }
            });

            if (!dismissed && dragRef.current[hi]) {
              activateButton(dragRef.current[hi]!.i);
            }
          }
          pinchStartRef.current[hi] = null;
        }
        dragRef.current[hi] = null;
      }
    });

    setState({
      indexTip: { x: primaryHand.sx, y: primaryHand.sy },
      pinching: anyPinching,
      draggingIndex: dragRef.current.find(d => d !== null)?.i ?? null,
      scalingIndex: scaleRef.current?.i ?? null,
      hoveredClose: currentHoverClose,
    });

  }, [results, canvasRef, buttonRects, setButtonRects, activateButton, closeRects, dismissRects, onClose]);

  return state;
};
