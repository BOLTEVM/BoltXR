export interface YieldOpportunity {
  id: string;
  protocol: string;
  chain: string;
  symbol: string;
  poolMeta: string | null;
  apy: number;
  apyBase: number | null;
  apyReward: number | null;
  tvlUsd: number;
  stablecoin: boolean;
  ilRisk: boolean;
  exposure: 'single' | 'multi' | string;
  risk: 'LOWER' | 'MEDIUM' | 'HIGH';
  url: string;
}

export interface YieldScanResult {
  opportunities: YieldOpportunity[];
  scannedAt: number;
  sourceCount: number;
}

export interface ProjectionPoint {
  day: number;
  value: number;
  rewards: number;
}

const numberOrNull = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Risk labels are deliberately simple UI heuristics, not audits or endorsements.
 * Protocol, smart-contract, oracle, bridge and depeg risks still apply to every row.
 */
export function riskSignal(pool: Pick<YieldOpportunity, 'apy' | 'tvlUsd' | 'stablecoin' | 'ilRisk' | 'exposure'>): YieldOpportunity['risk'] {
  if (pool.apy >= 50 || pool.tvlUsd < 1_000_000 || (pool.exposure === 'multi' && !pool.stablecoin)) return 'HIGH';
  if (pool.stablecoin && !pool.ilRisk && pool.tvlUsd >= 10_000_000 && pool.apy <= 20) return 'LOWER';
  return 'MEDIUM';
}

export async function scanYieldOpportunities(signal?: AbortSignal): Promise<YieldScanResult> {
  const timeout = AbortSignal.timeout(15_000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetch('https://yields.llama.fi/pools', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: combined,
  });
  if (!response.ok) throw new Error(`Yield data unavailable (${response.status})`);
  const body = await response.json() as { data?: Array<Record<string, unknown>> };
  if (!Array.isArray(body.data)) throw new Error('Yield data returned an unexpected format');

  const opportunities = body.data.flatMap((raw): YieldOpportunity[] => {
    const apy = numberOrNull(raw.apy);
    const tvlUsd = numberOrNull(raw.tvlUsd);
    if (typeof raw.pool !== 'string' || typeof raw.project !== 'string' || typeof raw.chain !== 'string' ||
      typeof raw.symbol !== 'string' || apy === null || tvlUsd === null || apy < 0 || tvlUsd < 0) return [];
    const stablecoin = raw.stablecoin === true;
    const ilRisk = raw.ilRisk === true;
    const exposure = typeof raw.exposure === 'string' ? raw.exposure : 'unknown';
    const base = { apy, tvlUsd, stablecoin, ilRisk, exposure };
    return [{
      id: raw.pool,
      protocol: raw.project,
      chain: raw.chain,
      symbol: raw.symbol,
      poolMeta: typeof raw.poolMeta === 'string' ? raw.poolMeta : null,
      apy,
      apyBase: numberOrNull(raw.apyBase),
      apyReward: numberOrNull(raw.apyReward),
      tvlUsd,
      stablecoin,
      ilRisk,
      exposure,
      risk: riskSignal(base),
      url: `https://defillama.com/yields/pool/${encodeURIComponent(raw.pool)}`,
    }];
  });

  return { opportunities, scannedAt: Date.now(), sourceCount: opportunities.length };
}

/** Illustrative daily-compounding scenario; it is not a forecast or position value. */
export function projectYield(principal: number, apyPercent: number, days: number, samples = 8): ProjectionPoint[] {
  const safePrincipal = Math.max(0, Number.isFinite(principal) ? principal : 0);
  const safeApy = Math.max(0, Number.isFinite(apyPercent) ? apyPercent : 0);
  const safeDays = Math.max(0, Math.min(365, Math.floor(days)));
  const count = Math.max(2, Math.min(32, Math.floor(samples)));
  const dailyRate = safeApy / 100 / 365;
  return Array.from({ length: count }, (_, index) => {
    const day = Math.round(safeDays * index / (count - 1));
    const value = safePrincipal * Math.pow(1 + dailyRate, day);
    return { day, value, rewards: value - safePrincipal };
  });
}

export function formatCompactUsd(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1,
  }).format(value);
}
