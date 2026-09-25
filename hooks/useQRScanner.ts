'use client';

/**
 * useQRScanner — Frame-sampling QR code scanner using jsQR.
 *
 * Taps into an existing <video> element and decodes a downscaled frame a few
 * times per second while enabled.
 */

import { useState, useEffect, useRef, useCallback, RefObject } from 'react';
import jsQR from 'jsqr';

export interface QRScanResult {
  data: string;
  timestamp: number;
}

const SCAN_INTERVAL_MS = 150;
const MAX_SCAN_WIDTH = 640;

export function useQRScanner(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean = false
) {
  const [scannedData, setScannedData] = useState<QRScanResult | null>(null);
  const lastScanRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let rafId: number | null = null;
    let lastRun = 0;
    let stopped = false;

    const tick = (time: number) => {
      if (stopped) return;
      rafId = requestAnimationFrame(tick);
      if (time - lastRun < SCAN_INTERVAL_MS) return;
      lastRun = time;

      const video = videoRef.current;
      if (!ctx || !video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;

      const scale = Math.min(1, MAX_SCAN_WIDTH / video.videoWidth);
      const width = Math.round(video.videoWidth * scale);
      const height = Math.round(video.videoHeight * scale);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

      try {
        ctx.drawImage(video, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        // attemptBoth also reads light-on-dark codes produced by older builds.
        const code = jsQR(imageData.data, width, height, { inversionAttempts: 'attemptBoth' });
        if (code?.data && code.data !== lastScanRef.current) {
          lastScanRef.current = code.data;
          setScannedData({ data: code.data, timestamp: Date.now() });
        }
      } catch {
        // Malformed frames can throw — keep scanning.
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [enabled, videoRef]);

  // Reset the scanner state (allow re-scanning)
  const reset = useCallback(() => {
    setScannedData(null);
    lastScanRef.current = null;
  }, []);

  return {
    scannedData,
    isScanning: enabled,
    reset,
  };
}
