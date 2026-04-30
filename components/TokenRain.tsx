'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { Group, Vector3, MathUtils } from 'three';
import { CHAINS } from '@/lib/boltows/chains';

function FallingCoin({ logo, color, startPos, speed, rotationSpeed }: { logo: string, color: string, startPos: Vector3, speed: number, rotationSpeed: Vector3 }) {
  const meshRef = useRef<Group>(null);
  const texture = useTexture(logo);

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.position.y -= speed * delta;
      meshRef.current.rotation.x += rotationSpeed.x * delta;
      meshRef.current.rotation.y += rotationSpeed.y * delta;
      meshRef.current.rotation.z += rotationSpeed.z * delta;

      // Reset if it goes below ground
      if (meshRef.current.position.y < -5) {
        meshRef.current.position.y = 15;
        meshRef.current.position.x = MathUtils.randFloatSpread(20);
        meshRef.current.position.z = MathUtils.randFloatSpread(20);
      }
    }
  });

  return (
    <group ref={meshRef} position={startPos}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.05, 16]} />
        <meshStandardMaterial color={color} metalness={0.9} roughness={0.1} />
        <mesh position={[0, 0.026, 0]} rotation={[-Math.PI / 2, 0, 0]}>
           <circleGeometry args={[0.15, 16]} />
           <meshStandardMaterial map={texture} transparent alphaTest={0.5} />
        </mesh>
      </mesh>
    </group>
  );
}

export default function TokenRain({ count = 50 }) {
  const chainKeys = Object.keys(CHAINS);
  
  const coins = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => {
      const chain = CHAINS[chainKeys[i % chainKeys.length]];
      return {
        id: i,
        logo: chain.logo,
        color: chain.color,
        startPos: new Vector3(MathUtils.randFloatSpread(20), MathUtils.randFloat(5, 15), MathUtils.randFloatSpread(20)),
        speed: MathUtils.randFloat(1, 4),
        rotationSpeed: new Vector3(Math.random(), Math.random(), Math.random())
      };
    });
  }, [count]);

  return (
    <group>
      {coins.map(coin => (
        <FallingCoin key={coin.id} {...coin} />
      ))}
    </group>
  );
}
