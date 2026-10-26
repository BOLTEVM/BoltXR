'use client';

/**
 * lib/xr/passthrough.ts — see-through mode for headset users.
 *
 * On headsets with cameras (Quest 3/3S/Pro, …) the wallet runs an
 * `immersive-ar` session, and passthrough becomes a *rendering* choice
 * rather than a session switch: when it is on, the virtual sky, stars, rain
 * and floor grid are not drawn and the cleared (transparent) frame shows the
 * room; when it is off, an opaque sky dome makes the same session look like
 * VR. So users can flip between the two from the watch without leaving the
 * session (re-requesting a session needs a fresh user gesture, which input
 * inside a session cannot reliably provide).
 */

import { useSyncExternalStore } from 'react';

let enabled = true;
const listeners = new Set<() => void>();

const subscribe = (cb: () => void) => {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
};

export const getPassthrough = (): boolean => enabled;

export function setPassthrough(on: boolean): void {
    if (on === enabled) return;
    enabled = on;
    listeners.forEach(l => l());
}

/** Whether see-through is requested (only takes effect in an immersive-ar session). */
export function usePassthrough(): boolean {
    return useSyncExternalStore(subscribe, getPassthrough, () => true);
}

/** Whether a session composites over the real world (immersive-ar: 'alpha-blend' on Quest, 'additive' on see-through glasses). */
export function canSeeThrough(session: XRSession | null | undefined): boolean {
    const blend = session?.environmentBlendMode;
    return blend === 'alpha-blend' || blend === 'additive';
}

/** True when this session is showing the user's surroundings right now. */
export function isSeeThrough(session: XRSession | null | undefined, requested: boolean): boolean {
    return canSeeThrough(session) && requested;
}
