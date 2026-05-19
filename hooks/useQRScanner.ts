'use client';

/**
 * useQRScanner — Frame-by-frame QR code scanner using jsQR.
 *
 * Taps into an existing <video> element (from react-webcam or a camera feed)
 * and runs jsQR detection on each animation frame when enabled.
 *
 * Works in both 2D HandTracking mode (reusing the webcam stream)
 * and XR mode (using a separate camera feed).
 */

import { useState, useEffect, useRef, useCallback, RefObject } from 'react';
import jsQR from 'jsqr';

export interface QRScanResult {
  data: string;
  timestamp: number;
}

export function useQRScanner(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean = false
) {
  const [scannedData, setScannedData] = useState<QRScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const lastScanRef = useRef<string | null>(null);

  // Create an offscreen canvas for frame extraction
  useEffect(() => {
    if (enabled && !canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
  }, [enabled]);

  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.readyState < 2) {
      rafIdRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    const width = video.videoWidth;
    const height = video.videoHeight;

    if (width === 0 || height === 0) {
      rafIdRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      rafIdRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    ctx.drawImage(video, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);

    try {
      const code = jsQR(imageData.data, width, height, {
        inversionAttempts: 'dontInvert',
      });

      if (code && code.data && code.data !== lastScanRef.current) {
        lastScanRef.current = code.data;
        setScannedData({
          data: code.data,
          timestamp: Date.now(),
        });
      }
    } catch {
      // jsQR can throw on malformed frames — silently continue
    }

    rafIdRef.current = requestAnimationFrame(scanFrame);
  }, [videoRef]);

  // Start/stop scanning loop
  useEffect(() => {
    if (enabled) {
      setIsScanning(true);
      setError(null);
      lastScanRef.current = null;
      rafIdRef.current = requestAnimationFrame(scanFrame);
    } else {
      setIsScanning(false);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    }

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [enabled, scanFrame]);

  // Reset the scanner state (allow re-scanning)
  const reset = useCallback(() => {
    setScannedData(null);
    lastScanRef.current = null;
    setError(null);
  }, []);

  return {
    scannedData,
    isScanning,
    error,
    reset,
  };
}
