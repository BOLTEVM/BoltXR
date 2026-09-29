'use client';

import { useEffect, useRef, useState } from 'react';
import type { Results, Hands as HandsType, Options } from '@mediapipe/hands';
import type { Size } from '@/lib/gesture-engine';

export type { Results };

export type TrackingStatus = 'LOADING' | 'NO_HANDS' | 'TRACKING' | 'ERROR';

export interface UseMediaPipeOptions {
  maxNumHands?: number;
  modelComplexity?: 0 | 1;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
  /** Called for every processed frame with the video's intrinsic size. */
  onResults?: (results: Results, frame: Size) => void;
}

type HandsConstructor = new (config: { locateFile: (file: string) => string }) => HandsType;

// Model assets are copied from the npm package into public/vendor at dev/build time
// (scripts/copy-vendor-assets.mjs), so no third-party code runs in the wallet page.
const locateFile = (file: string) => `/vendor/mediapipe/hands/${file}`;

/**
 * Runs MediaPipe Hands against an existing <video> element (e.g. react-webcam),
 * so only one camera stream is ever opened.
 */
export const useMediaPipe = (
  videoRef: React.RefObject<HTMLVideoElement | null>,
  options: UseMediaPipeOptions = {}
) => {
  const {
    maxNumHands = 2,
    modelComplexity = 1,
    minDetectionConfidence = 0.7,
    minTrackingConfidence = 0.5,
    onResults,
  } = options;

  const [status, setStatus] = useState<TrackingStatus>('LOADING');
  const onResultsRef = useRef(onResults);

  useEffect(() => {
    onResultsRef.current = onResults;
  }, [onResults]);

  useEffect(() => {
    let disposed = false;
    let rafId = 0;
    let processing = false;
    let hands: HandsType | null = null;

    const start = async () => {
      const mod = await import('@mediapipe/hands');
      // The package is a UMD bundle; depending on the bundler it exports or sets a global.
      const Ctor = ((mod as unknown as { Hands?: HandsConstructor }).Hands
        || (window as unknown as { Hands?: HandsConstructor }).Hands);
      if (!Ctor) throw new Error('MediaPipe Hands failed to load');
      if (disposed) return;

      hands = new Ctor({ locateFile });
      hands.setOptions({ maxNumHands, modelComplexity, minDetectionConfidence, minTrackingConfidence } as Options);
      hands.onResults(results => {
        if (disposed) return;
        const video = videoRef.current;
        const frame = { width: video?.videoWidth || 640, height: video?.videoHeight || 480 };
        setStatus(results.multiHandLandmarks?.length ? 'TRACKING' : 'NO_HANDS');
        onResultsRef.current?.(results, frame);
      });
      await hands.initialize();
      if (disposed) return;
      setStatus('NO_HANDS');

      const loop = async () => {
        if (disposed) return;
        const video = videoRef.current;
        if (hands && video && video.readyState >= 2 && video.videoWidth > 0 && !processing) {
          processing = true;
          try {
            await hands.send({ image: video });
          } catch (err) {
            if (!disposed) console.error('MediaPipe send error:', err);
          } finally {
            processing = false;
          }
        }
        if (!disposed) rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);
    };

    start().catch(err => {
      console.error('MediaPipe initialization failed:', err);
      if (!disposed) setStatus('ERROR');
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      hands?.close().catch(() => undefined);
      hands = null;
    };
  }, [videoRef, maxNumHands, modelComplexity, minDetectionConfidence, minTrackingConfidence]);

  return { status };
};
