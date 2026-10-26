'use client';

/**
 * WatchTryOn — the mint modal's stage: the watch in the studio, on a display arm, or on your
 * own wrist through the camera (MediaPipe Hands, on this device only). Preview only.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Camera, RefreshCw, SwitchCamera } from 'lucide-react';
import type { Results } from '@mediapipe/hands';
import { useMediaPipe } from '@/hooks/useMediaPipe';
import { ICED_OUT } from '@iced-out/watch';
import { IcedOutUnavailableError, type StageMode, type WatchStageLike } from '@/lib/iced-out/contract';
import { fitWatchToHand, PoseSmoother } from '@/lib/mint/tryon';
import { MANNEQUIN_FINISHES, type MannequinFinish } from '@/lib/mint/mannequin';
import { thumbUrl } from './rarity';

/** Assumed vertical field of view of a laptop / phone camera. Errors mostly cancel (see tryon.ts). */
const CAMERA_FOV_Y = (46 * Math.PI) / 180;

const MODES: { id: StageMode; label: string }[] = [
    { id: 'studio', label: 'Studio' },
    { id: 'wrist', label: 'On the wrist' },
    { id: 'camera', label: 'Try on' },
];

interface WatchTryOnProps {
    edition: number;
    mode: StageMode;
    onModeChange: (mode: StageMode) => void;
    /** Increment to make the stones celebrate. */
    celebrate: number;
}

type CameraHint = 'starting' | 'searching' | 'turn' | 'tracking' | 'blocked' | 'unavailable';

const HINTS: Record<CameraHint, string> = {
    starting: 'Starting the camera…',
    searching: 'Hold your hand up to the camera, back of the wrist facing it.',
    turn: 'Turn the back of your wrist toward the camera.',
    tracking: 'Move your wrist — the watch follows.',
    blocked: 'Camera access is blocked. Allow the camera for this site, or use On the wrist.',
    unavailable: 'No camera found. Use On the wrist to see it worn.',
};

function CameraTracker({ stageRef, onHint }: { stageRef: RefObject<WatchStageLike | null>; onHint: (h: CameraHint) => void }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [facing, setFacing] = useState<'user' | 'environment'>('user');
    const [canFlip, setCanFlip] = useState(false);
    const smoother = useRef(new PoseSmoother());
    const last = useRef(0);
    const mirror = facing === 'user';

    useEffect(() => {
        let stream: MediaStream | null = null;
        let cancelled = false;
        const video = videoRef.current;
        onHint('starting');
        const frame = () => {
            if (video?.videoWidth) stageRef.current?.setCameraFrame({ videoWidth: video.videoWidth, videoHeight: video.videoHeight, fovY: CAMERA_FOV_Y });
        };
        navigator.mediaDevices?.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
            .then(async s => {
                if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
                stream = s;
                if (video) {
                    video.srcObject = s;
                    video.addEventListener('loadedmetadata', frame);
                    video.addEventListener('resize', frame);
                    await video.play().catch(() => undefined);
                }
                onHint('searching');
                const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
                if (!cancelled) setCanFlip(devices.filter(d => d.kind === 'videoinput').length > 1);
            })
            .catch((e: DOMException) => {
                if (!cancelled) onHint(e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError' ? 'unavailable' : 'blocked');
            });
        if (!navigator.mediaDevices?.getUserMedia) onHint('unavailable');
        return () => {
            cancelled = true;
            video?.removeEventListener('loadedmetadata', frame);
            video?.removeEventListener('resize', frame);
            stream?.getTracks().forEach(t => t.stop());
            if (video) video.srcObject = null;
            stageRef.current?.setHandPose(null);
        };
    }, [facing, stageRef, onHint]);

    const onResults = useCallback((results: Results, size: { width: number; height: number }) => {
        const stage = stageRef.current;
        if (!stage) return;
        const now = performance.now();
        const dt = last.current ? now - last.current : 16;
        last.current = now;
        const lm = results.multiHandLandmarks?.[0];
        const wl = (results as Results & { multiHandWorldLandmarks?: { x: number; y: number; z: number }[][] }).multiHandWorldLandmarks?.[0];
        const label = results.multiHandedness?.[0]?.label ?? 'Right';
        if (!lm || !wl) {
            smoother.current.reset();
            stage.setHandPose(null);
            onHint('searching');
            return;
        }
        // the front camera is shown mirrored, like a mirror; track in the same (mirrored) picture
        const image = mirror ? lm.map(p => ({ x: 1 - p.x, y: p.y, z: p.z })) : lm;
        const world = mirror ? wl.map(p => ({ x: -p.x, y: p.y, z: p.z })) : wl;
        const g = stage.fitGeometry();
        const fit = fitWatchToHand({ image, world, label }, { fovY: CAMERA_FOV_Y, aspect: size.width / size.height }, { ...g, rawFrame: !mirror });
        if (!fit || fit.error > 0.06) {
            stage.setHandPose(null);
            onHint('searching');
            return;
        }
        const pose = smoother.current.push(fit, dt);
        stage.setHandPose({ ...pose, side: fit.side });
        onHint(fit.facing < 0.12 ? 'turn' : 'tracking');
    }, [stageRef, mirror, onHint]);

    useMediaPipe(videoRef, { maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.5, onResults });

    return (
        <>
            <video ref={videoRef} className={`mint-video${mirror ? ' is-mirrored' : ''}`} playsInline muted autoPlay aria-hidden />
            {canFlip && (
                <button type="button" className="mint-stage-chip mint-stage-flip" onClick={() => setFacing(f => (f === 'user' ? 'environment' : 'user'))}>
                    <SwitchCamera size={14} aria-hidden /> Switch camera
                </button>
            )}
        </>
    );
}

export default function WatchTryOn({ edition, mode, onModeChange, celebrate }: WatchTryOnProps) {
    const boxRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const stageRef = useRef<WatchStageLike | null>(null);
    const [built, setBuilt] = useState(0);
    const [failed, setFailed] = useState<string | null>(null);
    const [finish, setFinish] = useState<MannequinFinish>('porcelain');
    const [hint, setHint] = useState<CameraHint>('starting');

    useEffect(() => {
        const canvas = canvasRef.current, box = boxRef.current;
        if (!canvas || !box) return;
        let stage: WatchStageLike;
        try {
            const lowPower = window.matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency ?? 8) <= 4;
            stage = ICED_OUT.createWatchStage(canvas, {
                quality: lowPower ? 'xr' : 'hero',
                onReady: (id, err) => {
                    if (err) setFailed('This edition could not be built on this device.');
                    else setBuilt(id);
                },
            });
        } catch (e) {
            // no WebGL, or a build without the watch module: the studio photo stands in
            const why = e instanceof IcedOutUnavailableError
                ? 'The 3D try-on is not part of this build. This is the edition\'s studio photo.'
                : '3D preview needs WebGL, which this browser has turned off.';
            Promise.resolve().then(() => setFailed(why));
            return;
        }
        stageRef.current = stage;
        const ro = new ResizeObserver(([entry]) => {
            const r = entry.contentRect;
            stage.resize(r.width, r.height);
        });
        ro.observe(box);
        const onVis = () => (document.hidden ? stage.stop() : stage.start());
        document.addEventListener('visibilitychange', onVis);
        stage.start();
        return () => {
            document.removeEventListener('visibilitychange', onVis);
            ro.disconnect();
            stage.dispose();
            stageRef.current = null;
        };
    }, []);

    useEffect(() => { stageRef.current?.setEdition(edition); }, [edition]);
    useEffect(() => { stageRef.current?.setMode(mode); }, [mode]);
    useEffect(() => { stageRef.current?.setFinish(finish); }, [finish]);
    useEffect(() => { if (celebrate > 0) stageRef.current?.celebrate(); }, [celebrate]);

    const loading = !failed && built !== edition;
    const onHint = useCallback((h: CameraHint) => setHint(h), []);

    return (
        <div className={`mint-stage is-${mode}`}>
            <div ref={boxRef} className="mint-stage-view">
                {mode === 'camera' && !failed && <CameraTracker stageRef={stageRef} onHint={onHint} />}
                <canvas ref={canvasRef} className="mint-canvas" aria-label={`3D preview of edition #${edition}`} role="img" />
                {failed && (
                    <div className="mint-stage-fallback">
                        {/* eslint-disable-next-line @next/next/no-img-element -- static export */}
                        <img src={thumbUrl(edition)} alt={`Edition #${edition}`} />
                        <p>{failed}</p>
                    </div>
                )}
                {loading && (
                    <div className="mint-stage-loading" role="status">
                        <RefreshCw size={16} className="animate-spin" aria-hidden /> Setting the stones…
                    </div>
                )}
                {mode === 'camera' && !failed && (
                    <p className="mint-stage-hint" role="status" aria-live="polite">
                        <Camera size={14} aria-hidden /> {HINTS[hint]}
                    </p>
                )}
                {mode === 'wrist' && (
                    <div className="mint-finishes" role="radiogroup" aria-label="Display arm finish">
                        {(Object.keys(MANNEQUIN_FINISHES) as MannequinFinish[]).map(f => {
                            const c = MANNEQUIN_FINISHES[f].color.map(v => Math.round(Math.pow(v, 1 / 2.2) * 255));
                            return (
                                <button
                                    key={f}
                                    type="button"
                                    role="radio"
                                    aria-checked={finish === f}
                                    className="mint-finish"
                                    onClick={() => setFinish(f)}
                                    title={MANNEQUIN_FINISHES[f].label}
                                >
                                    <span style={{ background: `rgb(${c.join(',')})` }} aria-hidden />
                                    <span className="sr-only">{MANNEQUIN_FINISHES[f].label}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
            <div className="mint-modes segmented" role="group" aria-label="Preview">
                {MODES.map(m => (
                    <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => onModeChange(m.id)}>
                        {m.label}
                    </button>
                ))}
            </div>
            {mode === 'camera' && <p className="mint-privacy">The camera picture stays on this device; nothing is recorded or sent.</p>}
        </div>
    );
}
