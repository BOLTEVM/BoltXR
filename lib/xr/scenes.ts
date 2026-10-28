/**
 * lib/xr/scenes.ts — the wallet's selectable surroundings.
 *
 * Each scene is built from primitive geometry (no downloaded models or HDRs), so it loads instantly,
 * works offline and stays light enough for a standalone headset. `passthrough` draws nothing at all:
 * in an immersive-ar session the cleared frame shows the user's room.
 */

export type EnvType = 'space' | 'sunset' | 'forest' | 'city' | 'rain' | 'passthrough';

export interface SceneLook {
  label: string;
  /** Tile and reflection accent. */
  color: string;
  /** Sky dome gradient: zenith, horizon, below the horizon. */
  sky: [string, string, string];
  fog?: { color: string; near: number; far: number };
  ambient: { color: string; intensity: number };
  sun: { color: string; intensity: number; position: [number, number, number] };
}

export const SCENES: Record<EnvType, SceneLook> = {
  space: {
    label: 'DEEP SPACE', color: '#6366f1',
    sky: ['#02030a', '#14123a', '#010104'],
    ambient: { color: '#c7d2fe', intensity: 0.55 },
    sun: { color: '#e0e7ff', intensity: 2.1, position: [4, 8, 6] },
  },
  sunset: {
    label: 'NEON SUNSET', color: '#f43f5e',
    sky: ['#1e0638', '#f43f5e', '#12041f'],
    fog: { color: '#2a0a3d', near: 30, far: 140 },
    ambient: { color: '#fbcfe8', intensity: 0.7 },
    sun: { color: '#fdba74', intensity: 2.0, position: [0, 4, -10] },
  },
  forest: {
    label: 'ZEN GARDEN', color: '#10b981',
    sky: ['#0b1d2a', '#3f8f86', '#0b1210'],
    fog: { color: '#12302d', near: 18, far: 80 },
    ambient: { color: '#d1fae5', intensity: 0.8 },
    sun: { color: '#fef3c7', intensity: 1.9, position: [-6, 10, 4] },
  },
  city: {
    label: 'CYBER CITY', color: '#3b82f6',
    sky: ['#020617', '#1e3a8a', '#020617'],
    fog: { color: '#060b24', near: 25, far: 120 },
    ambient: { color: '#bfdbfe', intensity: 0.55 },
    sun: { color: '#93c5fd', intensity: 1.6, position: [5, 9, 3] },
  },
  rain: {
    label: 'TOKEN RAIN', color: '#f59e0b',
    sky: ['#0c0a03', '#6b3a0c', '#050402'],
    fog: { color: '#120c03', near: 25, far: 110 },
    ambient: { color: '#fde68a', intensity: 0.65 },
    sun: { color: '#fef3c7', intensity: 2.0, position: [4, 8, 6] },
  },
  passthrough: {
    label: 'PASSTHROUGH', color: '#e2e8f0',
    sky: ['#000000', '#000000', '#000000'],
    ambient: { color: '#ffffff', intensity: 0.9 },
    sun: { color: '#ffffff', intensity: 1.8, position: [2, 6, 4] },
  },
};

/** Dock order. */
export const SCENE_ORDER: EnvType[] = ['space', 'sunset', 'forest', 'city', 'rain', 'passthrough'];
