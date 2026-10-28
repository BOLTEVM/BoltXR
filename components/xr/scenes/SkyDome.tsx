'use client';

/**
 * SkyDome — an opaque gradient sky. Drawn first and without depth writes, so everything else sits
 * in front of it; in an immersive-ar session it is what hides the room when passthrough is off.
 */

import { useEffect, useMemo } from 'react';
import { BackSide, Color, Float32BufferAttribute, MeshBasicMaterial, SphereGeometry } from 'three';

const RADIUS = 160;

export default function SkyDome({ colors }: { colors: [string, string, string] }) {
    const [zenith, horizon, nadir] = colors;
    const geometry = useMemo(() => {
        const g = new SphereGeometry(RADIUS, 48, 24);
        const p = g.getAttribute('position');
        const top = new Color(zenith), mid = new Color(horizon), floor = new Color(nadir);
        const c = new Color();
        const values: number[] = [];
        for (let i = 0; i < p.count; i++) {
            const y = p.getY(i) / RADIUS;
            if (y >= 0) c.copy(mid).lerp(top, Math.pow(y, 0.45));
            else c.copy(mid).lerp(floor, Math.pow(-y, 0.35));
            values.push(c.r, c.g, c.b);
        }
        g.setAttribute('color', new Float32BufferAttribute(values, 3));
        return g;
    }, [zenith, horizon, nadir]);
    const material = useMemo(() => new MeshBasicMaterial({ name: 'Scene · Sky', vertexColors: true, side: BackSide, depthWrite: false, fog: false, toneMapped: false }), []);
    useEffect(() => () => geometry.dispose(), [geometry]);
    useEffect(() => () => material.dispose(), [material]);
    return <mesh geometry={geometry} material={material} renderOrder={-100} frustumCulled={false} />;
}
