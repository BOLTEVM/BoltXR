'use client';

import { Buffer } from 'buffer';
import process from 'process';

// Install Node globals at module evaluation so crypto libraries that probe
// for them during their own first run (before any effect fires) find them.
if (typeof window !== 'undefined') {
  const w = window as unknown as { Buffer?: typeof Buffer; process?: typeof process };
  w.Buffer = w.Buffer || Buffer;
  w.process = w.process || process;
}

export default function Polyfills() {
  return null;
}
