import { describe, test, expect } from 'bun:test';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { fitWatchToHand, project, solveTranslation, type Landmark } from '../../lib/mint/tryon';

const cam = { fovY: (50 * Math.PI) / 180, aspect: 16 / 9 };

/** A left hand, palm toward the camera, fingers up (three camera axes, metres, hand-centred). */
function leftPalmFacing(): Vector3[] {
    const p: Vector3[] = Array.from({ length: 21 }, () => new Vector3());
    p[0].set(0, -0.06, 0);           // wrist
    p[1].set(0.03, -0.045, 0.012);   // thumb CMC (thumb on the image right for a left palm)
    p[5].set(0.034, 0.03, 0);        // index MCP
    p[9].set(0.011, 0.034, 0);       // middle MCP
    p[13].set(-0.011, 0.032, 0);     // ring MCP
    p[17].set(-0.03, 0.026, 0);      // pinky MCP
    for (const i of [2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15, 16, 18, 19, 20]) p[i].set(0, 0.06, 0);
    return p;
}

const mirrorX = (v: Vector3) => new Vector3(-v.x, v.y, v.z);
const toMp = (v: Vector3): Landmark => ({ x: v.x, y: -v.y, z: -v.z });

function observe(local: Vector3[], rot: Quaternion, T: Vector3, label: string) {
    const world = local.map(v => v.clone().applyQuaternion(rot));
    const image = world.map(v => { const q = project(v.clone().add(T), cam); return { x: q.x, y: q.y, z: 0 }; });
    return { obs: { image, world: world.map(toMp), label }, world };
}

const opts = { zBack: -0.006, wristDepth: 0.041 };

describe('try-on fit', () => {
    test('translation solver recovers the exact offset', () => {
        const P = leftPalmFacing();
        const T = new Vector3(0.05, -0.03, -0.45);
        const image = P.map(v => ({ ...project(v.clone().add(T), cam), z: 0 }));
        const got = solveTranslation(P, image, cam)!;
        expect(got.distanceTo(T)).toBeLessThan(1e-9);
    });

    test('left hand: crown toward the fingers, dial on the back of the hand', () => {
        // raw frame: MediaPipe calls a real left hand "Right"
        const T = new Vector3(-0.02, 0.01, -0.4);
        const { obs } = observe(leftPalmFacing(), new Quaternion(), T, 'Right');
        const fit = fitWatchToHand(obs, cam, opts)!;
        expect(fit.side).toBe('left');
        const m = new Matrix4().makeRotationFromQuaternion(fit.quaternion);
        const X = new Vector3().setFromMatrixColumn(m, 0), Z = new Vector3().setFromMatrixColumn(m, 2);
        expect(X.y).toBeGreaterThan(0.99);           // along the hand, toward the fingers
        expect(Z.z).toBeLessThan(-0.99);             // palm faces the camera, so the dial faces away
        expect(fit.facing).toBeLessThan(-0.9);
        expect(fit.error).toBeLessThan(1e-9);
        // the axis is 28 mm down the forearm from the wrist landmark
        const along = new Vector3(0.011, 0.094, 0).normalize();
        expect(fit.axis.distanceTo(new Vector3(0, -0.06, 0).add(T).addScaledVector(along, -0.028))).toBeLessThan(1e-9);
    });

    test('turning the back of the left hand to the camera shows the dial', () => {
        const flip = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
        const { obs } = observe(leftPalmFacing(), flip, new Vector3(0, 0, -0.35), 'Right');
        const fit = fitWatchToHand(obs, cam, opts)!;
        expect(fit.side).toBe('left');
        expect(fit.facing).toBeGreaterThan(0.9);
    });

    test('right hand (mirror image): worn with the crown toward the elbow, dial on the back', () => {
        const right = leftPalmFacing().map(mirrorX);
        const flip = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI); // back of hand to camera
        const { obs } = observe(right, flip, new Vector3(0.03, -0.02, -0.38), 'Left');
        const fit = fitWatchToHand(obs, cam, opts)!;
        expect(fit.side).toBe('right');
        expect(fit.facing).toBeGreaterThan(0.9);
        const m = new Matrix4().makeRotationFromQuaternion(fit.quaternion);
        expect(new Vector3().setFromMatrixColumn(m, 0).y).toBeLessThan(-0.99); // crown toward the elbow
        expect(m.determinant()).toBeCloseTo(1, 9);   // a proper rotation, never a mirror
    });

    test('arbitrary poses round-trip', () => {
        let worst = 0;
        for (let k = 0; k < 200; k++) {
            const rot = new Quaternion().setFromAxisAngle(new Vector3(Math.sin(k), Math.cos(k * 1.3), Math.sin(k * 0.7)).normalize(), k * 0.37);
            const T = new Vector3(Math.sin(k * 2.1) * 0.08, Math.cos(k * 1.7) * 0.05, -0.3 - (k % 7) * 0.04);
            const { obs } = observe(leftPalmFacing(), rot, T, 'Right');
            const fit = fitWatchToHand(obs, cam, opts);
            expect(fit).not.toBeNull();
            worst = Math.max(worst, fit!.error);
            const along = new Vector3(0.011, 0.094, 0).normalize().applyQuaternion(rot);
            const m = new Matrix4().makeRotationFromQuaternion(fit!.quaternion);
            expect(new Vector3().setFromMatrixColumn(m, 0).dot(along)).toBeGreaterThan(0.999);
        }
        expect(worst).toBeLessThan(1e-9);
    });

    test('a hand behind the camera is rejected', () => {
        const { obs } = observe(leftPalmFacing(), new Quaternion(), new Vector3(0, 0, 0.4), 'Right');
        expect(fitWatchToHand(obs, cam, opts)).toBeNull();
    });
});
