/**
 * lib/mint/tryon.ts — where a watch sits on a hand seen by the camera (MediaPipe Hands).
 *
 * MediaPipe gives each hand twice: 21 image landmarks (normalised x right, y down) and the same
 * 21 points in metres around the hand's centre ("world" landmarks, camera-aligned axes). The
 * world points fix the wrist's orientation and size; the image points fix where it is, by
 * solving for the one translation that projects the world points onto the image points
 * (linear least squares through a pinhole camera of known field of view).
 *
 * Output is in three.js camera space (camera at the origin looking down −Z, +Y up), as the pose
 * of the watch root — the IcedWatch frame: crown +X, 12 o'clock +Y, dial +Z, case back −Z.
 */

import { Matrix4, Quaternion, Vector3 } from 'three';

export interface Landmark { x: number; y: number; z: number }

export interface HandObservation {
    /** 21 normalised image landmarks (x right, y down, 0…1). */
    image: readonly Landmark[];
    /** 21 world landmarks in metres (x right, y down, z away from the camera). */
    world: readonly Landmark[];
    /** MediaPipe's label. It assumes a mirrored (selfie) image, so for raw frames it is swapped. */
    label: 'Left' | 'Right' | string;
}

export interface PinholeCamera {
    /** Vertical field of view, radians. */
    fovY: number;
    /** Width / height of the frame. */
    aspect: number;
}

export interface WristFit {
    /** Watch root position, metres, camera space. */
    position: Vector3;
    quaternion: Quaternion;
    /** Which wrist the hand belongs to. */
    side: 'left' | 'right';
    /** cos of the angle between the dial normal and the direction to the camera (> 0: dial visible). */
    facing: number;
    /** Wrist (forearm) axis point the bracelet wraps, camera space. */
    axis: Vector3;
    /** Mean reprojection error of the fitted points, in normalised image units. */
    error: number;
}

export interface FitOptions {
    /** How far up the forearm from MediaPipe's wrist point the watch sits (m). */
    wristOffset?: number;
    /** IcedWatch geometry: case back z and wrist depth (the axis is at zBack − depth / 2). */
    zBack: number;
    wristDepth: number;
    /** The frame shown is the raw camera frame (true), or was mirrored before tracking (false). */
    rawFrame?: boolean;
}

const WRIST = 0, THUMB_CMC = 1, INDEX_MCP = 5, MIDDLE_MCP = 9, RING_MCP = 13, PINKY_MCP = 17;
const FIT_POINTS = [WRIST, THUMB_CMC, INDEX_MCP, MIDDLE_MCP, RING_MCP, PINKY_MCP];

/** MediaPipe world coordinates (y down, z away) → three camera coordinates (y up, z toward the viewer). */
const toCam = (l: Landmark) => new Vector3(l.x, -l.y, -l.z);

/** Solve the 3×3 system A x = b (Cramer's rule; A is symmetric positive definite here). */
function solve3(A: number[][], b: number[]): [number, number, number] | null {
    const det = (m: number[][]) =>
        m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const d = det(A);
    if (!Number.isFinite(d) || Math.abs(d) < 1e-12) return null;
    const col = (k: number) => A.map((row, i) => row.map((v, j) => (j === k ? b[i] : v)));
    return [det(col(0)) / d, det(col(1)) / d, det(col(2)) / d];
}

/**
 * Translation T that best projects the (camera-space, hand-centred) points P onto the image
 * points: for each point, (P + T) must lie on the ray through its pixel.
 */
export function solveTranslation(P: readonly Vector3[], image: readonly Landmark[], cam: PinholeCamera): Vector3 | null {
    const ty = Math.tan(cam.fovY / 2), tx = ty * cam.aspect;
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const b = [0, 0, 0];
    const add = (row: [number, number, number], rhs: number) => {
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) A[i][j] += row[i] * row[j];
            b[i] += row[i] * rhs;
        }
    };
    for (let i = 0; i < P.length; i++) {
        const k = (image[i].x * 2 - 1) * tx;   // x / −z on the ray
        const m = (1 - image[i].y * 2) * ty;   // y / −z on the ray
        // (Px + Tx) = −k (Pz + Tz)  →  Tx + k Tz = −k Pz − Px
        add([1, 0, k], -k * P[i].z - P[i].x);
        add([0, 1, m], -m * P[i].z - P[i].y);
    }
    const t = solve3(A, b);
    return t ? new Vector3(t[0], t[1], t[2]) : null;
}

export function project(p: Vector3, cam: PinholeCamera): { x: number; y: number } {
    const ty = Math.tan(cam.fovY / 2), tx = ty * cam.aspect;
    return { x: (p.x / -p.z / tx + 1) / 2, y: (1 - p.y / -p.z / ty) / 2 };
}

/** Fit the watch to the observed hand; null when the hand is degenerate or behind the camera. */
export function fitWatchToHand(obs: HandObservation, cam: PinholeCamera, opts: FitOptions): WristFit | null {
    if (obs.world.length < 21 || obs.image.length < 21) return null;
    const W = obs.world.map(toCam);
    const along = new Vector3().subVectors(W[MIDDLE_MCP], W[WRIST]);           // toward the fingers
    const radial = new Vector3().subVectors(W[INDEX_MCP], W[PINKY_MCP]);       // toward the thumb side
    if (along.lengthSq() < 1e-6 || radial.lengthSq() < 1e-6) return null;
    along.normalize();
    radial.addScaledVector(along, -radial.dot(along)).normalize();

    // MediaPipe labels assume a mirrored image; tracking runs on raw frames, so the label is swapped
    const labelled: 'left' | 'right' = obs.label === 'Left' ? 'left' : 'right';
    const side: 'left' | 'right' = (opts.rawFrame ?? true) ? (labelled === 'left' ? 'right' : 'left') : labelled;
    // camera space: a right hand's palm faces −(radial × along); the back of the hand the other way
    const cross = new Vector3().crossVectors(radial, along);
    const dorsal = side === 'right' ? cross : cross.negate();

    // watch frame: left wrist crown toward the hand; right wrist worn the usual way, crown toward the elbow
    const X = side === 'left' ? along.clone() : along.clone().negate();
    const Z = dorsal.clone().normalize();
    const Y = new Vector3().crossVectors(Z, X).normalize();
    const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(X, Y, Z));

    const T = solveTranslation(FIT_POINTS.map(i => W[i]), FIT_POINTS.map(i => obs.image[i]), cam);
    if (!T || T.z > -0.05) return null; // behind or implausibly close to the lens

    let err = 0;
    for (const i of FIT_POINTS) {
        const p = project(W[i].clone().add(T), cam);
        err += Math.hypot(p.x - obs.image[i].x, p.y - obs.image[i].y);
    }
    err /= FIT_POINTS.length;

    const axis = W[WRIST].clone().add(T).addScaledVector(along, -(opts.wristOffset ?? 0.028));
    // the watch root sits so its wrist axis (0, 0, zBack − depth/2 in the watch frame) lands on `axis`
    const position = axis.clone().addScaledVector(Z, -(opts.zBack - opts.wristDepth / 2));
    const toCamera = position.clone().negate().normalize();
    return { position, quaternion: q, side, facing: Z.dot(toCamera), axis, error: err };
}

/** Exponential smoothing of successive fits (position and rotation), with a snap on big jumps. */
export class PoseSmoother {
    private p: Vector3 | null = null;
    private q = new Quaternion();
    constructor(private readonly halfLifeMs = 70, private readonly snapMetres = 0.12) {}

    reset(): void {
        this.p = null;
    }

    push(fit: { position: Vector3; quaternion: Quaternion }, dtMs: number): { position: Vector3; quaternion: Quaternion } {
        if (!this.p || this.p.distanceTo(fit.position) > this.snapMetres) {
            this.p = fit.position.clone();
            this.q.copy(fit.quaternion);
        } else {
            const a = 1 - Math.pow(0.5, dtMs / this.halfLifeMs);
            this.p.lerp(fit.position, a);
            this.q.slerp(fit.quaternion, a);
        }
        return { position: this.p.clone(), quaternion: this.q.clone() };
    }
}
