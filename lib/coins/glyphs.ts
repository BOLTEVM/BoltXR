/**
 * lib/coins/glyphs.ts — a geometric monoline capital font, as strokes.
 *
 * Cap height 1, baseline 0. Each glyph is a few straight strokes and circular
 * arcs, so it renders at any weight as a signed distance field: sculpted
 * monograms (BNB, TRX, any generated coin) and the legends engraved round the
 * field use the same letters, with no font file and no canvas.
 */

import { arc, segment, union, type Sdf2 } from './sdf2d';

type Stroke = ['L', number, number, number, number] | ['A', number, number, number, number, number];

interface Glyph {
    w: number;
    s: Stroke[];
}

const L = (x0: number, y0: number, x1: number, y1: number): Stroke => ['L', x0, y0, x1, y1];
/** Arc centre (cx, cy), radius r, from a0° counter-clockwise to a1° (a1 > a0). */
const A = (cx: number, cy: number, r: number, a0: number, a1: number): Stroke => ['A', cx, cy, r, a0, a1];

const GLYPHS: Record<string, Glyph> = {
    A: { w: 0.72, s: [L(0, 0, 0.36, 1), L(0.36, 1, 0.72, 0), L(0.15, 0.36, 0.57, 0.36)] },
    B: { w: 0.6, s: [L(0, 0, 0, 1), L(0, 1, 0.3, 1), A(0.3, 0.76, 0.24, -90, 90), L(0, 0.52, 0.34, 0.52), A(0.34, 0.26, 0.26, -90, 90), L(0, 0, 0.34, 0)] },
    C: { w: 0.88, s: [A(0.5, 0.5, 0.5, 48, 312)] },
    D: { w: 0.74, s: [L(0, 0, 0, 1), L(0, 1, 0.24, 1), A(0.24, 0.5, 0.5, -90, 90), L(0, 0, 0.24, 0)] },
    E: { w: 0.54, s: [L(0, 0, 0, 1), L(0, 1, 0.54, 1), L(0, 0.5, 0.44, 0.5), L(0, 0, 0.54, 0)] },
    F: { w: 0.52, s: [L(0, 0, 0, 1), L(0, 1, 0.52, 1), L(0, 0.5, 0.42, 0.5)] },
    G: { w: 0.96, s: [A(0.5, 0.5, 0.5, 40, 360), L(1, 0.5, 0.56, 0.5)] },
    H: { w: 0.66, s: [L(0, 0, 0, 1), L(0.66, 0, 0.66, 1), L(0, 0.5, 0.66, 0.5)] },
    I: { w: 0, s: [L(0, 0, 0, 1)] },
    J: { w: 0.46, s: [L(0.46, 1, 0.46, 0.25), A(0.23, 0.25, 0.23, 180, 360)] },
    K: { w: 0.6, s: [L(0, 0, 0, 1), L(0.6, 1, 0, 0.4), L(0.2, 0.6, 0.62, 0)] },
    L: { w: 0.5, s: [L(0, 1, 0, 0), L(0, 0, 0.5, 0)] },
    M: { w: 0.84, s: [L(0, 0, 0, 1), L(0, 1, 0.42, 0.28), L(0.42, 0.28, 0.84, 1), L(0.84, 1, 0.84, 0)] },
    N: { w: 0.66, s: [L(0, 0, 0, 1), L(0, 1, 0.66, 0), L(0.66, 0, 0.66, 1)] },
    O: { w: 1, s: [A(0.5, 0.5, 0.5, 0, 360)] },
    P: { w: 0.58, s: [L(0, 0, 0, 1), L(0, 1, 0.32, 1), A(0.32, 0.74, 0.26, -90, 90), L(0, 0.48, 0.32, 0.48)] },
    Q: { w: 1, s: [A(0.5, 0.5, 0.5, 0, 360), L(0.64, 0.3, 1.0, -0.06)] },
    R: { w: 0.6, s: [L(0, 0, 0, 1), L(0, 1, 0.32, 1), A(0.32, 0.74, 0.26, -90, 90), L(0, 0.48, 0.32, 0.48), L(0.26, 0.48, 0.6, 0)] },
    S: { w: 0.58, s: [A(0.29, 0.75, 0.25, 30, 270), A(0.29, 0.25, 0.25, -150, 90)] },
    T: { w: 0.64, s: [L(0, 1, 0.64, 1), L(0.32, 1, 0.32, 0)] },
    U: { w: 0.62, s: [L(0, 1, 0, 0.31), A(0.31, 0.31, 0.31, 180, 360), L(0.62, 0.31, 0.62, 1)] },
    V: { w: 0.68, s: [L(0, 1, 0.34, 0), L(0.34, 0, 0.68, 1)] },
    W: { w: 0.96, s: [L(0, 1, 0.24, 0), L(0.24, 0, 0.48, 0.72), L(0.48, 0.72, 0.72, 0), L(0.72, 0, 0.96, 1)] },
    X: { w: 0.64, s: [L(0, 0, 0.64, 1), L(0, 1, 0.64, 0)] },
    Y: { w: 0.66, s: [L(0, 1, 0.33, 0.5), L(0.66, 1, 0.33, 0.5), L(0.33, 0.5, 0.33, 0)] },
    Z: { w: 0.6, s: [L(0, 1, 0.6, 1), L(0.6, 1, 0, 0), L(0, 0, 0.6, 0)] },
    0: { w: 0.62, s: [A(0.31, 0.69, 0.31, 0, 180), A(0.31, 0.31, 0.31, 180, 360), L(0, 0.31, 0, 0.69), L(0.62, 0.31, 0.62, 0.69)] },
    1: { w: 0.34, s: [L(0.04, 0.82, 0.3, 1), L(0.3, 1, 0.3, 0)] },
    2: { w: 0.62, s: [A(0.31, 0.69, 0.31, -35, 180), L(0.564, 0.512, 0, 0), L(0, 0, 0.62, 0)] },
    3: { w: 0.6, s: [A(0.29, 0.76, 0.24, -90, 160), A(0.29, 0.26, 0.26, -160, 90)] },
    4: { w: 0.66, s: [L(0.48, 0, 0.48, 1), L(0.48, 1, 0, 0.3), L(0, 0.3, 0.66, 0.3)] },
    5: { w: 0.62, s: [L(0.56, 1, 0.06, 1), L(0.06, 1, 0.11, 0.57), A(0.31, 0.32, 0.31, -150, 128)] },
    6: { w: 0.62, s: [A(0.31, 0.31, 0.31, 0, 360), L(0.02, 0.4, 0.42, 1)] },
    7: { w: 0.6, s: [L(0, 1, 0.6, 1), L(0.6, 1, 0.16, 0)] },
    8: { w: 0.6, s: [A(0.3, 0.77, 0.23, 0, 360), A(0.3, 0.27, 0.27, 0, 360)] },
    9: { w: 0.62, s: [A(0.31, 0.69, 0.31, 0, 360), L(0.6, 0.6, 0.2, 0)] },
    '·': { w: 0, s: [L(0, 0.5, 0, 0.5)] },
    '-': { w: 0.4, s: [L(0, 0.5, 0.4, 0.5)] },
    '/': { w: 0.5, s: [L(0, 0, 0.5, 1)] },
    '#': { w: 0.66, s: [L(0.2, 0, 0.3, 1), L(0.44, 0, 0.54, 1), L(0.04, 0.34, 0.66, 0.34), L(0, 0.66, 0.62, 0.66)] },
};

export const SPACE = 0.42;

export function hasGlyph(ch: string): boolean {
    return ch === ' ' || GLYPHS[ch.toUpperCase()] !== undefined;
}

/** One glyph as a union of strokes, origin at its baseline-left, cap height 1. */
export function glyphSdf(ch: string, weight: number, dx = 0, dy = 0): Sdf2 | null {
    const g = GLYPHS[ch.toUpperCase()];
    if (!g) return null;
    return union(...g.s.map(s => s[0] === 'L'
        ? segment(s[1] + dx, s[2] + dy, s[3] + dx, s[4] + dy, weight)
        : arc(s[1] + dx, s[2] + dy, s[3], (s[4] * Math.PI) / 180, (s[5] * Math.PI) / 180, weight)));
}

export function glyphWidth(ch: string): number {
    if (ch === ' ') return SPACE;
    return GLYPHS[ch.toUpperCase()]?.w ?? 0;
}

/** Advance from one glyph to the next: its width plus the stroke and the gap. */
export function advance(ch: string, weight: number, tracking: number): number {
    return glyphWidth(ch) + (ch === ' ' ? 0 : weight * 2) + tracking;
}

export interface TextLayout {
    sdf: Sdf2;
    /** Total width, cap units, stroke included. */
    width: number;
}

/**
 * A line of text centred on x = 0, baseline at y = -0.5 (cap height centred on
 * the origin), in cap units. Characters the font has no glyph for are skipped.
 */
export function textSdf(text: string, weight = 0.09, tracking = 0.18): TextLayout | null {
    const chars = [...text].filter(hasGlyph);
    if (!chars.length) return null;
    const width = chars.reduce((w, ch, i) => w + advance(ch, weight, i === chars.length - 1 ? 0 : tracking), 0);
    let x = -width / 2 + weight;
    const parts: Sdf2[] = [];
    chars.forEach(ch => {
        const g = ch === ' ' ? null : glyphSdf(ch, weight, x, -0.5);
        if (g) parts.push(g);
        x += advance(ch, weight, tracking);
    });
    return parts.length ? { sdf: union(...parts), width } : null;
}

/** The ₿ currency sign: a B with two short bars above and below, in cap units centred on the origin. */
export function bitcoinSignSdf(weight = 0.1): Sdf2 {
    const dx = -0.3, dy = -0.5;
    const b = glyphSdf('B', weight, dx, dy) as Sdf2;
    const bar = (x: number) => [
        segment(x + dx, 1 + dy, x + dx, 1.2 + dy, weight * 0.85),
        segment(x + dx, dy, x + dx, -0.2 + dy, weight * 0.85),
    ];
    return union(b, ...bar(0.12), ...bar(0.32));
}
