/**
 * lib/iced-out/contract.ts — what the wallet needs from the Iced-Out XR watch module.
 *
 * The watches themselves (designs, editions → build specs, the dial, the movement, the try-on
 * stage, the self-destruct) live in a private repository checked out at private/iced-out.
 * `@iced-out/watch` resolves to its index.ts when that folder is there, and to ./missing.ts
 * when it is not (a build from the public repository): no watches, the classic Wrist OS watch on
 * every wrist, the studio photo in place of the 3D try-on. next.config.ts picks the file;
 * tsconfig.json lists both so either type-checks.
 */

import type { ComponentType } from 'react';
import type { Quaternion, Vector3 } from 'three';
import type { WatchView } from '@/components/xr/WristWatch';
import type { MannequinFinish } from '@/lib/mint/mannequin';

export type StageMode = 'studio' | 'wrist' | 'camera';
export type WatchQuality = 'xr' | 'hero';

export interface StageCameraFrame {
    /** Video frame size (px) — the full frame MediaPipe saw. */
    videoWidth: number;
    videoHeight: number;
    /** Vertical field of view assumed for the camera, radians. */
    fovY: number;
}

export interface StageHandPose {
    position: Vector3;
    quaternion: Quaternion;
    side: 'left' | 'right';
}

export interface WatchStageOptions {
    /** 'hero' for the best stones; 'xr' for phones and while the camera is tracking. */
    quality?: WatchQuality;
    /** Called when an edition has been built (or failed). */
    onReady?: (edition: number, error?: unknown) => void;
}

/** The mint modal's 3D stage (studio pillow, display arm, camera try-on). */
export interface WatchStageLike {
    setEdition(id: number): void;
    setMode(mode: StageMode): void;
    setFinish(finish: MannequinFinish): void;
    setCameraFrame(frame: StageCameraFrame): void;
    setHandPose(pose: StageHandPose | null): void;
    celebrate(): void;
    /** The current watch's case back and wrist depth, for lib/mint/tryon.ts. */
    fitGeometry(): { zBack: number; wristDepth: number };
    resize(width: number, height: number): void;
    start(): void;
    stop(): void;
    dispose(): void;
}

/** Props of the worn watch: the same as the classic <WristWatch>, plus the edition. */
export interface IcedWristWatchProps {
    open: boolean;
    active: WatchView;
    locked: boolean;
    totalUsd: number | null;
    /** dApp signature requests waiting (shown on the WEB button). */
    pendingApprovals?: number;
    onToggle: () => void;
    onSelect: (view: WatchView) => void;
    /** Edition 1…150. */
    edition: number;
    /** Which wrist it is worn on in XR. */
    hand?: 'left' | 'right';
    /** Softer sparkle, no celebration strobe. */
    calm?: boolean;
    /** Called once the watch has self-destructed (it was worn without being held). */
    onRevoked?: (edition: number) => void;
}

export interface IcedOutModule {
    /** false in a build without the private module. */
    available: boolean;
    /** The worn watch; null without the module (the wrist keeps the classic watch). */
    IcedWristWatch: ComponentType<IcedWristWatchProps> | null;
    /** Throws IcedOutUnavailableError without the module. */
    createWatchStage(canvas: HTMLCanvasElement, opts?: WatchStageOptions): WatchStageLike;
}

export class IcedOutUnavailableError extends Error {
    constructor() {
        super('This build does not include the Iced-Out XR watches.');
        this.name = 'IcedOutUnavailableError';
    }
}
