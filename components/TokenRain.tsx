'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';
import { mulberry32 } from '@/lib/xr/prng';

interface CoinSpec {
  id: number;
  color: string;
  start: [number, number, number];
  speed: number;
  spin: [number, number, number];
  respawn: () => [number, number];
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

/** Falling coins in the given colours (the scene passes the colours of the coins you hold). */
export default function TokenRain({ count = 50, colors = ['#d4af37'] }: { count?: number; colors?: string[] }) {
  const palette = colors.join(',');
  const coins = useMemo<CoinSpec[]>(() => {
    const list = palette.split(',');
    const rand = mulberry32(0xb017);
    const spread = (range: number) => (rand() - 0.5) * range;
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      color: list[i % list.length],
      start: [spread(20), 5 + rand() * 10, spread(20)],
      speed: 1 + rand() * 3,
      spin: [rand(), rand(), rand()],
      respawn: () => [spread(20), spread(20)],
    }));
  }, [count, palette]);

  return (
    <group>
      {coins.map(coin => (
        <FallingCoin key={coin.id} {...coin} />
      ))}
    </group>
  );
}
