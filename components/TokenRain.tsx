'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';
import { CHAINS } from '@/lib/boltows/chains';

interface CoinSpec {
  id: number;
  color: string;
  start: [number, number, number];
  speed: number;
  spin: [number, number, number];
  respawn: () => [number, number];
}

/** Small deterministic PRNG so the layout is stable across renders (and pure). */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function FallingCoin({ color, start, speed, spin, respawn }: CoinSpec) {
  const ref = useRef<Group>(null);

  useFrame((_, delta) => {
    const coin = ref.current;
    if (!coin) return;
    coin.position.y -= speed * delta;
    coin.rotation.x += spin[0] * delta;
    coin.rotation.y += spin[1] * delta;
    coin.rotation.z += spin[2] * delta;
    // Recycle coins that fall below the floor.
    if (coin.position.y < -5) {
      const [x, z] = respawn();
      coin.position.set(x, 15, z);
    }
  });

  return (
    <group ref={ref} position={start}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.05, 16]} />
        <meshStandardMaterial color={color} metalness={0.9} roughness={0.15} emissive={color} emissiveIntensity={0.15} />
      </mesh>
    </group>
  );
}

export default function TokenRain({ count = 50 }: { count?: number }) {
  const coins = useMemo<CoinSpec[]>(() => {
    const colors = Object.values(CHAINS).map(chain => chain.color);
    const rand = mulberry32(0xb017);
    const spread = (range: number) => (rand() - 0.5) * range;
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      color: colors[i % colors.length],
      start: [spread(20), 5 + rand() * 10, spread(20)],
      speed: 1 + rand() * 3,
      spin: [rand(), rand(), rand()],
      respawn: () => [spread(20), spread(20)],
    }));
  }, [count]);

  return (
    <group>
      {coins.map(coin => (
        <FallingCoin key={coin.id} {...coin} />
      ))}
    </group>
  );
}
