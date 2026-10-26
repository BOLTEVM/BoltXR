'use client';

/**
 * lib/xr/session.ts — the app's single XR store and how sessions start.
 *
 * "Passthrough" starts an `immersive-ar` session (on Quest that is the
 * colour passthrough feed) in which the watch can flip between the room and
 * a virtual sky at any time; "VR" keeps the classic `immersive-vr` session.
 */

import { createXRStore } from '@react-three/xr';
import { setPassthrough } from './passthrough';

// The app installs its own flag-gated emulator (lib/xr-emulation); disable the library's localhost auto-emulation.
export const xrStore = createXRStore({ emulate: false });

export interface XRSupport { vr: boolean; ar: boolean }

/**
 * passthrough — an immersive-ar session showing the room (toggle to a
 *               virtual sky from the watch without leaving the session);
 * vr          — a classic immersive-vr session (or, where only AR exists,
 *               an AR session with the virtual sky on).
 */
export function startSession(support: XRSupport, kind: 'passthrough' | 'vr'): void {
    if (kind === 'passthrough' && support.ar) {
        setPassthrough(true);
        void xrStore.enterAR();
    } else if (kind === 'vr' && support.vr) {
        setPassthrough(false);
        void xrStore.enterVR();
    } else if (support.ar) {
        setPassthrough(kind === 'passthrough');
        void xrStore.enterAR();
    }
}
