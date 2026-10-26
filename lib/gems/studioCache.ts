/**
 * lib/gems/studioCache.ts — one jewellery studio environment per renderer,
 * shared by every watch drawn with it (built once, ~2 ms of GPU work).
 */

import type { WebGLRenderer } from 'three';
import { createStudioEnvironment, type StudioEnvironment } from './studioEnv';

const cache = new WeakMap<WebGLRenderer, StudioEnvironment>();

export function studioFor(renderer: WebGLRenderer, size = 256): StudioEnvironment {
    let env = cache.get(renderer);
    if (!env) {
        env = createStudioEnvironment(renderer, size);
        cache.set(renderer, env);
    }
    return env;
}
