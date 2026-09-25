/**
 * GestureEngine — turns per-frame hand landmarks into UI interactions:
 * hover, pinch-tap, pinch-drag and two-hand pinch-resize.
 *
 * Pure TypeScript (no React) so it can run inside the MediaPipe callback and
 * be unit tested. Coordinates are CSS pixels in the viewport.
 */

import type { Rect } from './constants';

export interface Landmark { x: number; y: number; z?: number }
export interface Point { x: number; y: number }
export interface Size { width: number; height: number }
export interface Zone extends Rect {
  id: string;
  /** Region inside the zone that does not count (e.g. the modal itself). */
  exclude?: Rect;
}

export interface HandFrame {
  landmarks: Landmark[];
  /** "Left" / "Right" as reported by MediaPipe; used to keep smoothing stable. */
  label?: string;
}

export interface GestureTargets {
  buttons: Rect[];
  /** Close buttons: pinch-release on one fires `close`. */
  closeZones: Zone[];
  /** Areas where a tap dismisses an overlay (e.g. modal backdrop). */
  dismissZones: Zone[];
  /** When true, gestures move the cursor but never activate anything. */
  paused?: boolean;
}

export type GestureEvent =
  | { type: 'activate'; index: number }
  | { type: 'close'; id: string }
  | { type: 'pinch-start' }
  | { type: 'tap' };

export interface GestureState {
  cursor: Point | null;
  pinching: boolean;
  handCount: number;
  hoveredButton: number | null;
  hoveredClose: string | null;
  draggingIndex: number | null;
  scalingIndex: number | null;
}

export interface GestureUpdate {
  state: GestureState;
  events: GestureEvent[];
  /** New button rects when a drag or resize moved something, else null. */
  rects: Rect[] | null;
}

const TAP_MS = 350;
const TAP_MOVE_PX = 14;
// Pinch is measured relative to hand size so it works near and far from the camera.
const PINCH_START = 0.32;
const PINCH_END = 0.45;
const SMOOTHING = 0.45;
const MIN_W = 80, MAX_W = 420, MIN_H = 40, MAX_H = 160;

const WRIST = 0, THUMB_TIP = 4, INDEX_TIP = 8, MIDDLE_MCP = 9;

interface HandTrack {
  smoothed: Point;
  pinching: boolean;
  pinchStart: { time: number; x: number; y: number; hitClose?: string } | null;
  drag: { index: number; offX: number; offY: number } | null;
  moved: boolean;
}

const inside = (p: Point, r: Rect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/**
 * Map a normalized landmark to viewport pixels for a mirrored video that is
 * displayed with `object-fit: cover`.
 */
export function mapToViewport(lm: Landmark, frame: Size, view: Size, mirrored = true): Point {
  const scale = Math.max(view.width / frame.width, view.height / frame.height);
  const dispW = frame.width * scale;
  const dispH = frame.height * scale;
  const offX = (view.width - dispW) / 2;
  const offY = (view.height - dispH) / 2;
  const x = offX + lm.x * dispW;
  return {
    x: mirrored ? view.width - x : x,
    y: offY + lm.y * dispH,
  };
}

export class GestureEngine {
  private hands = new Map<string, HandTrack>();
  private scale: { index: number; initDist: number; initW: number; initH: number } | null = null;

  reset() {
    this.hands.clear();
    this.scale = null;
  }

  update(frames: HandFrame[], frame: Size, view: Size, targets: GestureTargets, now = Date.now()): GestureUpdate {
    const events: GestureEvent[] = [];
    let rects: Rect[] | null = null;

    if (frames.length === 0 || frame.width === 0 || frame.height === 0) {
      this.reset();
      return {
        state: { cursor: null, pinching: false, handCount: 0, hoveredButton: null, hoveredClose: null, draggingIndex: null, scalingIndex: null },
        events,
        rects,
      };
    }

    // Resolve stable per-hand tracks (by handedness label, falling back to order).
    const seen = new Set<string>();
    const active: { key: string; track: HandTrack; point: Point }[] = [];
    frames.slice(0, 2).forEach((hand, i) => {
      let key = hand.label || `hand${i}`;
      if (seen.has(key)) key = `${key}${i}`;
      seen.add(key);
      const lm = hand.landmarks;
      if (!lm || lm.length < 21) return;

      const raw = mapToViewport(lm[INDEX_TIP], frame, view);
      const thumb = mapToViewport(lm[THUMB_TIP], frame, view);
      const wrist = mapToViewport(lm[WRIST], frame, view);
      const middle = mapToViewport(lm[MIDDLE_MCP], frame, view);
      const handSize = Math.max(1, Math.hypot(wrist.x - middle.x, wrist.y - middle.y));
      const ratio = Math.hypot(raw.x - thumb.x, raw.y - thumb.y) / handSize;

      let track = this.hands.get(key);
      if (!track) {
        track = { smoothed: raw, pinching: false, pinchStart: null, drag: null, moved: false };
        this.hands.set(key, track);
      }
      track.smoothed = {
        x: track.smoothed.x + (raw.x - track.smoothed.x) * SMOOTHING,
        y: track.smoothed.y + (raw.y - track.smoothed.y) * SMOOTHING,
      };
      // Hysteresis prevents flicker right at the threshold.
      track.pinching = track.pinching ? ratio < PINCH_END : ratio < PINCH_START;
      active.push({ key, track, point: track.smoothed });
    });
    for (const key of Array.from(this.hands.keys())) {
      if (!seen.has(key)) this.hands.delete(key);
    }

    let buttons = targets.buttons;
    const primary = active[0]?.point ?? null;

    // Two-hand resize: both hands pinching on the same button.
    const [a, b] = active;
    if (a && b && a.track.pinching && b.track.pinching && !targets.paused) {
      const shared = a.track.drag && b.track.drag && a.track.drag.index === b.track.drag.index ? a.track.drag.index : -1;
      if (shared !== -1 && buttons[shared]) {
        const dist = Math.hypot(a.point.x - b.point.x, a.point.y - b.point.y);
        if (!this.scale || this.scale.index !== shared) {
          const r = buttons[shared];
          this.scale = { index: shared, initDist: Math.max(1, dist), initW: r.w, initH: r.h };
        } else {
          const ratio = dist / this.scale.initDist;
          const w = Math.max(MIN_W, Math.min(MAX_W, this.scale.initW * ratio));
          const h = Math.max(MIN_H, Math.min(MAX_H, this.scale.initH * ratio));
          const midX = (a.point.x + b.point.x) / 2 - w / 2;
          const midY = (a.point.y + b.point.y) / 2 - h / 2;
          buttons = buttons.map((r, j) => (j === shared ? { x: midX, y: midY, w, h } : r));
          rects = buttons;
          // A resize is never a tap, however quick.
          a.track.moved = true;
          b.track.moved = true;
        }
      }
    } else {
      this.scale = null;
    }

    let hoveredClose: string | null = null;
    let hoveredButton: number | null = null;

    for (const { track, point } of active) {
      const closeHit = targets.closeZones.find(z => inside(point, z));
      if (closeHit) hoveredClose = closeHit.id;
      if (hoveredButton === null) {
        const idx = buttons.findIndex(r => inside(point, r));
        if (idx !== -1) hoveredButton = idx;
      }

      if (track.pinching) {
        if (!track.pinchStart) {
          track.pinchStart = { time: now, x: point.x, y: point.y };
          track.moved = false;
          events.push({ type: 'pinch-start' });
          if (!targets.paused) {
            if (closeHit) {
              track.pinchStart.hitClose = closeHit.id;
            } else if (!this.scale) {
              // A second hand may grab the same button — that is how resizing starts.
              const idx = buttons.findIndex(r => inside(point, r));
              if (idx !== -1) track.drag = { index: idx, offX: point.x - buttons[idx].x, offY: point.y - buttons[idx].y };
            }
          }
        }

        const sharedGrab = track.drag && active.some(h => h.track !== track && h.track.drag?.index === track.drag?.index);
        if (track.drag && !this.scale && !sharedGrab && track.pinchStart) {
          if (Math.hypot(point.x - track.pinchStart.x, point.y - track.pinchStart.y) > TAP_MOVE_PX) track.moved = true;
          if (track.moved) {
            const { index, offX, offY } = track.drag;
            buttons = buttons.map((r, j) => (j === index ? { ...r, x: point.x - offX, y: point.y - offY } : r));
            rects = buttons;
          }
        }
      } else if (track.pinchStart) {
        // Release
        const wasTap = now - track.pinchStart.time < TAP_MS && !track.moved;
        const hitClose = track.pinchStart.hitClose;
        if (!targets.paused) {
          if (hitClose && closeHit?.id === hitClose) {
            events.push({ type: 'close', id: hitClose });
          } else if (wasTap) {
            const dismiss = targets.dismissZones.find(z => inside(point, z) && !(z.exclude && inside(point, z.exclude)));
            if (dismiss && !track.drag) {
              events.push({ type: 'close', id: dismiss.id });
            } else if (track.drag) {
              events.push({ type: 'tap' }, { type: 'activate', index: track.drag.index });
            }
          }
        }
        track.pinchStart = null;
        track.drag = null;
        track.moved = false;
      }
    }

    const dragging = active.find(h => h.track.drag && h.track.moved);
    return {
      state: {
        cursor: primary,
        pinching: active.some(h => h.track.pinching),
        handCount: active.length,
        hoveredButton,
        hoveredClose,
        draggingIndex: dragging?.track.drag?.index ?? null,
        scalingIndex: this.scale?.index ?? null,
      },
      events,
      rects,
    };
  }
}
