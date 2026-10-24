'use client';

import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import { Group, Vector3 } from 'three';

/** Keeps expanded workflows in front of the HMD instead of clipping into the wrist. */
export default function XRTaskPanel({ children }: { children: ReactNode }) {
  const ref = useRef<Group>(null);
  const session = useXR(state => state.session);
  const target = useMemo(() => new Vector3(), []);

  useFrame(({ camera }) => {
    if (!ref.current || !session) return;
    target.set(0, -0.015, -0.64).applyQuaternion(camera.quaternion).add(camera.position);
    ref.current.position.lerp(target, 0.24);
    ref.current.quaternion.slerp(camera.quaternion, 0.24);
    const scale = 0.44;
    ref.current.scale.lerp(target.set(scale, scale, scale), 0.24);
  });

  return <group ref={ref} scale={session ? 0.44 : 1}>{children}</group>;
}
