import { useEffect, useRef, useState, useCallback } from 'react';
import type { Results, Hands as HandsType } from '@mediapipe/hands';
import * as mpHands from '@mediapipe/hands';
import type { Camera as CameraType } from '@mediapipe/camera_utils';
import * as cam from '@mediapipe/camera_utils';

// MediaPipe packages often don't have proper ESM exports and set globals instead
const Hands = (mpHands as any).Hands || (typeof window !== 'undefined' && (window as any).Hands);
const Camera = (cam as any).Camera || (typeof window !== 'undefined' && (window as any).Camera);
const HAND_CONNECTIONS = (mpHands as any).HAND_CONNECTIONS || (typeof window !== 'undefined' && (window as any).HAND_CONNECTIONS);

export type { Results };

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface UseMediaPipeOptions {
  maxNumHands?: number;
  modelComplexity?: 0 | 1;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
}

export const useMediaPipe = (
  videoRef: React.RefObject<HTMLVideoElement | null>,
  options: UseMediaPipeOptions = {}
) => {
  const [results, setResults] = useState<Results | null>(null);
  const [status, setStatus] = useState<'INITIALIZING' | 'TRACKING' | 'NO_HANDS' | 'ERROR'>('INITIALIZING');
  const handsRef = useRef<HandsType | null>(null);
  const cameraRef = useRef<CameraType | null>(null);
  const isProcessingRef = useRef(false);
  const isStartedRef = useRef(false);

  const {
    maxNumHands = 2,
    modelComplexity = 1,
    minDetectionConfidence = 0.7,
    minTrackingConfidence = 0.5,
  } = options;

  const onResults = useCallback((results: Results) => {
    setResults(results);
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      setStatus('TRACKING');
    } else if (status !== 'ERROR') {
      setStatus('NO_HANDS');
    }
  }, [status]);

  useEffect(() => {
    // Prevent double initialization in dev mode (React 18 StrictMode)
    if (handsRef.current) return;

    const hands = new Hands({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands,
      modelComplexity,
      minDetectionConfidence,
      minTrackingConfidence,
    });

    hands.onResults(onResults);
    handsRef.current = hands;

    const startCamera = async () => {
      if (isStartedRef.current) return;
      const video = videoRef.current;
      if (!video) return;

      try {
        cameraRef.current = new Camera(video, {
          onFrame: async () => {
            if (handsRef.current && video && !isProcessingRef.current) {
              isProcessingRef.current = true;
              try {
                await handsRef.current.send({ image: video });
              } catch (err) {
                console.error("MediaPipe Send Error:", err);
              } finally {
                isProcessingRef.current = false;
              }
            }
          },
          width: 640,
          height: 480,
        });
        if (cameraRef.current) {
          await cameraRef.current.start();
        }
        isStartedRef.current = true;
        console.log("MediaPipe Camera Started");
      } catch (err) {
        console.error("MediaPipe Camera Start Failure:", err);
        setStatus('ERROR');
      }
    };

    // Robust video readiness check
    const checkVideo = setInterval(() => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        startCamera();
        clearInterval(checkVideo);
      }
    }, 250);

    return () => {
      clearInterval(checkVideo);
      isStartedRef.current = false;
      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }
      if (handsRef.current) {
        handsRef.current.close();
        handsRef.current = null;
      }
      setStatus('INITIALIZING');
    };
  }, [videoRef, maxNumHands, modelComplexity, minDetectionConfidence, minTrackingConfidence, onResults]);

  return { results, status, HAND_CONNECTIONS };
};
