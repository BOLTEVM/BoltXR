'use client';

import { useEffect, useState } from 'react';

/** Seconds remaining until `until` (epoch ms), ticking once per second. */
export function useCountdown(until: number | null | undefined): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!until || until <= Date.now()) return;
    const id = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= until) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [until]);

  if (!until) return 0;
  return Math.max(0, Math.ceil((until - now) / 1000));
}
