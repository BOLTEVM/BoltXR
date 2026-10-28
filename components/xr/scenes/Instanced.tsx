'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Color, Euler, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';

export interface InstanceSpec {
    position: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
    color?: string;
}

/** One draw call for many copies of a primitive (trees, rocks, buildings…). Children: geometry + material. */
export default function Instanced({ items, children, castShadow = false }: { items: InstanceSpec[]; children: ReactNode; castShadow?: boolean }) {
    const ref = useRef<InstancedMesh>(null);
    useLayoutEffect(() => {
        const mesh = ref.current;
        if (!mesh) return;
        const m = new Matrix4(), q = new Quaternion(), e = new Euler(), p = new Vector3(), s = new Vector3(), c = new Color();
        items.forEach((item, i) => {
            q.setFromEuler(e.set(...(item.rotation ?? [0, 0, 0])));
            m.compose(p.set(...item.position), q, s.set(...(item.scale ?? [1, 1, 1])));
            mesh.setMatrixAt(i, m);
            if (item.color) mesh.setColorAt(i, c.set(item.color));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
    }, [items]);
    return (
        <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow={castShadow} key={items.length}>
            {children}
        </instancedMesh>
    );
}
