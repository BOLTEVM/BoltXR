'use client';

/**
 * VirtualSky — an opaque sky dome for immersive-ar sessions with
 * passthrough switched off, so the same session reads as full VR.
 * Drawn first and without depth writes: stars, grid and panels sit in front.
 */

import { useEffect, useMemo } from 'react';
import { BackSide, Color, Float32BufferAttribute, MeshBasicMaterial, SphereGeometry } from 'three';

export default function VirtualSky({ tint }: { tint: string }) {
    const geometry = useMemo(() => {
        const g = new SphereGeometry(160, 48, 24);
        const p = g.getAttribute('position');
        const top = new Color('#02030a'), horizon = new Color(tint).multiplyScalar(0.16).lerp(new Color('#05060f'), 0.5), floor = new Color('#010104');
        const c = new Color();
        const colors: number[] = [];
        for (let i = 0; i < p.count; i++) {
            const y = p.getY(i) / 160;
            if (y >= 0) c.copy(horizon).lerp(top, Math.pow(y, 0.6));
            else c.copy(horizon).lerp(floor, Math.pow(-y, 0.5));
            colors.push(c.r, c.g, c.b);
        }
        g.setAttribute('color', new Float32BufferAttribute(colors, 3));
        return g;
    }, [tint]);
    const material = useMemo(() => new MeshBasicMaterial({ name: 'Scene · Virtual sky', vertexColors: true, side: BackSide, depthWrite: false, fog: false }), []);
    useEffect(() => () => geometry.dispose(), [geometry]);
    useEffect(() => () => material.dispose(), [material]);
    return <mesh geometry={geometry} material={material} renderOrder={-100} frustumCulled={false} />;
}
