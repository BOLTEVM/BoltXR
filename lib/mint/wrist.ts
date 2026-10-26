/**
 * lib/mint/wrist.ts — the wrist every watch is sized for: an ellipse at the watch's centre line.
 * Shared by the try-on display arm (lib/mint/mannequin.ts) and the watches' bracelets.
 */

export interface WristSize {
    /** Wrist width (radial ↔ ulnar), metres. */
    width: number;
    /** Wrist depth (dorsal ↔ palmar), metres. */
    depth: number;
}

export const DEFAULT_WRIST: WristSize = { width: 0.058, depth: 0.041 };
