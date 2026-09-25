import React from 'react';

/**
 * Offline-friendly token badge (no remote logo fetches): the chain color with
 * the ticker's leading letters.
 */
export default function TokenIcon({ symbol, color, size = 32 }: { symbol: string; color: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, size * 0.32),
        background: `radial-gradient(circle at 30% 30%, ${color}, ${color}99 70%)`,
        boxShadow: `0 0 0 1px ${color}66, 0 0 16px ${color}33`,
        letterSpacing: '0.02em',
      }}
    >
      {symbol.slice(0, symbol.length > 3 ? 2 : 3)}
    </span>
  );
}
