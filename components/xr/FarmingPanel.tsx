'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RoundedBox, Text } from '@react-three/drei';
import Button3D, { XR_THEME } from './Button3D';
import {
  formatCompactUsd,
  projectYield,
  scanYieldOpportunities,
  type YieldOpportunity,
  type YieldScanResult,
} from '@/lib/farming';
import { errorMessage } from '@/lib/format';

const TVL_FILTERS = [100_000, 1_000_000, 10_000_000];
const APY_FILTERS = [30, 100, 10_000];
const AMOUNTS = [100, 1000, 10_000];
const TERMS = [7, 30, 90, 365];
const RISK_COLORS = { LOWER: '#34d399', MEDIUM: '#fbbf24', HIGH: '#fb7185' };

function OpportunityRow({ pool, selected, position, onSelect }: {
  pool: YieldOpportunity; selected: boolean; position: [number, number, number]; onSelect: () => void;
}) {
  return (
    <group position={position}>
      <Button3D
        label={`${pool.symbol.slice(0, 17)}  ·  ${pool.apy.toFixed(1)}%`}
        onPress={onSelect}
        width={1.64}
        height={0.22}
        fontSize={0.048}
        color={selected ? '#155e75' : XR_THEME.raised}
      />
      <Text position={[-0.73, -0.145, 0]} fontSize={0.028} color={XR_THEME.muted} anchorX="left" maxWidth={1.15}>
        {`${pool.protocol.toUpperCase()} · ${pool.chain.toUpperCase()} · TVL ${formatCompactUsd(pool.tvlUsd)}`}
      </Text>
      <Text position={[0.74, -0.145, 0]} fontSize={0.027} color={RISK_COLORS[pool.risk]} anchorX="right">
        {pool.risk}
      </Text>
    </group>
  );
}

function YieldVisualizer({ pool, principal, days }: { pool: YieldOpportunity; principal: number; days: number }) {
  const points = useMemo(() => projectYield(principal, pool.apy, days, 8), [principal, pool.apy, days]);
  const final = points[points.length - 1];
  const maxValue = Math.max(final.value, 1);
  return (
    <group>
      <Text position={[-0.77, -0.86, 0]} fontSize={0.038} color="#67e8f9" anchorX="left" maxWidth={1.5}>
        {`ILLUSTRATION · $${principal.toLocaleString()} FOR ${days} DAYS`}
      </Text>
      <Text position={[-0.77, -0.94, 0]} fontSize={0.03} color={XR_THEME.muted} anchorX="left" maxWidth={1.55}>
        {`PROJECTED ${formatCompactUsd(final.value)} · REWARDS ${formatCompactUsd(final.rewards)} · DAILY COMPOUNDING`}
      </Text>
      <Text position={[-0.77, -1.03, 0]} fontSize={0.027} color={XR_THEME.faint} anchorX="left" maxWidth={1.55}>
        {`BASE ${pool.apyBase?.toFixed(1) ?? '—'}% · REWARD ${pool.apyReward?.toFixed(1) ?? '—'}% · ${pool.exposure.toUpperCase()} EXPOSURE`}
      </Text>
      <group position={[0, -1.29, 0]}>
        <mesh position={[0, -0.13, -0.01]}>
          <planeGeometry args={[1.58, 0.008]} />
          <meshBasicMaterial color="#334155" />
        </mesh>
        {points.map((point, index) => {
          const height = 0.06 + (point.value / maxValue) * 0.34;
          return (
            <mesh key={point.day} position={[-0.68 + index * 0.195, -0.13 + height / 2, 0]}>
              <boxGeometry args={[0.135, height, 0.025]} />
              <meshStandardMaterial
                color={index === points.length - 1 ? '#34d399' : '#0e7490'}
                emissive={index === points.length - 1 ? '#059669' : '#155e75'}
                emissiveIntensity={0.25}
                roughness={0.35}
                name="Farm · Projection bar"
              />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

export default function FarmingPanel({ onClose }: { onClose: () => void }) {
  const [result, setResult] = useState<YieldScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tvlIndex, setTvlIndex] = useState(1);
  const [apyIndex, setApyIndex] = useState(0);
  const [stableOnly, setStableOnly] = useState(false);
  const [sort, setSort] = useState<'apy' | 'tvl'>('apy');
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amountIndex, setAmountIndex] = useState(1);
  const [termIndex, setTermIndex] = useState(1);
  const abortRef = useRef<AbortController | null>(null);

  const scan = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const next = await scanYieldOpportunities(controller.signal);
      setResult(next);
      setSelectedId(current => next.opportunities.some(pool => pool.id === current) ? current : null);
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorMessage(cause));
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => { void scan(); });
    return () => abortRef.current?.abort();
  }, [scan]);

  const filtered = useMemo(() => {
    if (!result) return [];
    const minTvl = TVL_FILTERS[tvlIndex];
    const maxApy = APY_FILTERS[apyIndex];
    return result.opportunities
      .filter(pool => pool.tvlUsd >= minTvl && pool.apy <= maxApy && (!stableOnly || pool.stablecoin))
      .sort((a, b) => sort === 'apy' ? b.apy - a.apy : b.tvlUsd - a.tvlUsd);
  }, [result, tvlIndex, apyIndex, stableOnly, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / 4));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * 4, safePage * 4 + 4);
  const selected = filtered.find(pool => pool.id === selectedId) || visible[0] || null;
  const principal = AMOUNTS[amountIndex];
  const days = TERMS[termIndex];

  const resetPage = (action: () => void) => { action(); setPage(0); };

  return (
    <group>
      <RoundedBox args={[1.84, 3.94, 0.09]} radius={0.08} smoothness={4}>
        <meshStandardMaterial color="#07111f" metalness={0.45} roughness={0.3} name="Farm · Obsidian panel" />
      </RoundedBox>
      <RoundedBox args={[1.86, 3.96, 0.035]} radius={0.08} smoothness={4} position={[0, 0, -0.055]}>
        <meshStandardMaterial color="#059669" emissive="#10b981" emissiveIntensity={0.18} transparent opacity={0.35} name="Farm · Emerald rim" />
      </RoundedBox>
      <group position={[0, 0, 0.065]}>
        <Text position={[-0.77, 1.27, 0]} fontSize={0.073} color="#f8fafc" anchorX="left">YIELD RADAR</Text>
        <Text position={[-0.77, 1.15, 0]} fontSize={0.029} color={XR_THEME.muted} anchorX="left" maxWidth={1.5}>
          {result ? `DEFILLAMA · ${filtered.length.toLocaleString()} MATCHES · ${new Date(result.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'LIVE PUBLIC MARKET DATA'}
        </Text>
        <Button3D label={loading ? 'SCANNING…' : 'RESCAN'} onPress={() => void scan()} position={[0.59, 1.22, 0]} width={0.4} height={0.18} fontSize={0.035} color="#059669" disabled={loading} />

        <Button3D label={`TVL ≥ ${formatCompactUsd(TVL_FILTERS[tvlIndex])}`} onPress={() => resetPage(() => setTvlIndex((tvlIndex + 1) % TVL_FILTERS.length))} position={[-0.56, 0.94, 0]} width={0.55} height={0.17} fontSize={0.032} />
        <Button3D label={`APY < ${APY_FILTERS[apyIndex] === 10000 ? 'ANY' : `${APY_FILTERS[apyIndex]}%`}`} onPress={() => resetPage(() => setApyIndex((apyIndex + 1) % APY_FILTERS.length))} position={[0, 0.94, 0]} width={0.5} height={0.17} fontSize={0.032} />
        <Button3D label={stableOnly ? 'STABLES ✓' : 'ALL ASSETS'} onPress={() => resetPage(() => setStableOnly(!stableOnly))} position={[0.58, 0.94, 0]} width={0.54} height={0.17} fontSize={0.032} color={stableOnly ? '#059669' : XR_THEME.raised} />

        {loading && !result && <Text position={[0, 0.42, 0]} fontSize={0.055} color="#67e8f9" anchorX="center">SCANNING YIELD MARKETS…</Text>}
        {error && (
          <group>
            <Text position={[0, 0.5, 0]} fontSize={0.04} color="#fda4af" anchorX="center" maxWidth={1.5} textAlign="center">{error.toUpperCase()}</Text>
            <Button3D label="TRY AGAIN" onPress={() => void scan()} position={[0, 0.2, 0]} width={0.7} height={0.18} color="#be123c" />
          </group>
        )}
        {!loading && !error && visible.length === 0 && (
          <Text position={[0, 0.42, 0]} fontSize={0.045} color={XR_THEME.muted} anchorX="center" maxWidth={1.45} textAlign="center">
            NO POOLS MATCH THESE FILTERS. LOWER TVL OR RAISE THE APY LIMIT.
          </Text>
        )}

        {visible.map((pool, index) => (
          <OpportunityRow key={pool.id} pool={pool} selected={selected?.id === pool.id} position={[0, 0.69 - index * 0.38, 0]} onSelect={() => setSelectedId(pool.id)} />
        ))}

        <Button3D label="‹" onPress={() => setPage(Math.max(0, safePage - 1))} position={[-0.72, -0.74, 0]} width={0.2} height={0.15} disabled={safePage === 0} />
        <Text position={[0, -0.74, 0]} fontSize={0.032} color={XR_THEME.muted} anchorX="center">{`${safePage + 1} / ${pageCount}`}</Text>
        <Button3D label="›" onPress={() => setPage(Math.min(pageCount - 1, safePage + 1))} position={[0.72, -0.74, 0]} width={0.2} height={0.15} disabled={safePage >= pageCount - 1} />
        <Button3D label={sort === 'apy' ? 'SORT: APY' : 'SORT: TVL'} onPress={() => setSort(sort === 'apy' ? 'tvl' : 'apy')} position={[0, -0.74, 0]} width={0.46} height={0.15} fontSize={0.03} />

        {selected && <YieldVisualizer pool={selected} principal={principal} days={days} />}
        <Button3D label={`$${principal.toLocaleString()}`} onPress={() => setAmountIndex((amountIndex + 1) % AMOUNTS.length)} position={[-0.57, -1.54, 0]} width={0.48} height={0.16} fontSize={0.033} color="#155e75" />
        <Button3D label={`${days} DAYS`} onPress={() => setTermIndex((termIndex + 1) % TERMS.length)} position={[-0.06, -1.54, 0]} width={0.43} height={0.16} fontSize={0.033} color="#155e75" />
        {selected && <Button3D label="POOL INFO ↗" onPress={() => window.open(selected.url, '_blank', 'noopener,noreferrer')} position={[0.56, -1.54, 0]} width={0.5} height={0.16} fontSize={0.03} />}
        <Text position={[0, -1.72, 0]} fontSize={0.025} color="#fbbf24" anchorX="center" maxWidth={1.6} textAlign="center">
          ESTIMATE ONLY · APY CAN CHANGE · SMART CONTRACT / DEPEG / IL RISK
        </Text>
        <Button3D label="CLOSE" onPress={onClose} position={[0, -1.88, 0]} width={0.52} height={0.14} fontSize={0.035} />
      </group>
    </group>
  );
}
