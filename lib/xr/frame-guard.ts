'use client';

/**
 * lib/xr/frame-guard.ts — keep the XR frame loop alive when a frame throws.
 *
 * three.js runs the frame callback first and only then asks the XRSession for
 * the next frame, so a single exception (in any useFrame, onBeforeRender, draw
 * call, or three's own input-source update) stops frame submission for good.
 * The page itself stays alive, but the headset gets no frames: the Quest shows its loading spinner and then
 * "This page isn't responding". Guarding the frame callback turns that into one
 * skipped frame plus a console error naming what failed.
 */

export interface FrameErrorReport {
    message: string;
    stack?: string;
    count: number;
    firstAt: string;
}

declare global {
    interface Window {
        /** Errors thrown inside the render loop, for diagnosing headset-only failures. */
        __boltxrFrameErrors?: FrameErrorReport[];
    }
}

const reports = new Map<string, FrameErrorReport>();

function report(error: unknown): void {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const existing = reports.get(message);
    if (existing) {
        existing.count++;
        return;
    }
    const entry: FrameErrorReport = {
        message,
        stack: error instanceof Error ? error.stack : undefined,
        count: 1,
        firstAt: new Date().toISOString(),
    };
    reports.set(message, entry);
    window.__boltxrFrameErrors = [...reports.values()];
    // Logged once per distinct error: a per-frame log would flood the console at 72-120 Hz.
    console.error('[BoltXR] A frame threw; skipping it so the XR session keeps rendering.', error);
}

let installed = false;

/**
 * Patch XRSession.requestAnimationFrame so a frame that throws is reported and
 * the next frame is still requested (three's own re-request was skipped by the
 * throw). Covers three's input-source updates as well as R3F and app code.
 */
export function guardXRFrames(): void {
    if (installed || typeof XRSession === 'undefined') return;
    installed = true;
    const requestFrame = XRSession.prototype.requestAnimationFrame;
    XRSession.prototype.requestAnimationFrame = function guardedRequestAnimationFrame(this: XRSession, callback: XRFrameRequestCallback) {
        return requestFrame.call(this, (time, frame) => {
            try {
                callback(time, frame);
            } catch (error) {
                report(error);
                if (frame.session === this) this.requestAnimationFrame(callback);
            }
        });
    };
}
