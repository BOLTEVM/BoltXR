'use client';

import React, { Suspense } from 'react';

interface State { failed: boolean }

/**
 * Isolates optional 3D content that loads remote assets (HDR maps, textures):
 * while loading or on failure it renders `fallback` instead of taking down
 * the whole canvas.
 */
class Boundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('Optional 3D content failed to load:', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function SafeBoundary({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return (
    <Boundary fallback={fallback}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </Boundary>
  );
}
