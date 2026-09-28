/** Shared display formatting so every surface (2D, XR, dialogs) reads the same. */

/** Trim a decimal string to at most `maxDecimals` places, dropping trailing zeros. */
export const formatAmount = (value: string | number | null | undefined, maxDecimals = 6): string => {
  if (value === null || value === undefined || value === '') return '0';
  const str = typeof value === 'number' ? value.toFixed(maxDecimals) : String(value);
  const [whole, fraction = ''] = str.split('.');
  const trimmed = fraction.slice(0, maxDecimals).replace(/0+$/, '');
  const wholeFormatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (!trimmed) {
    // Keep a hint that a tiny non-zero balance exists.
    return /[1-9]/.test(fraction) && whole.replace('-', '') === '0' ? `<0.${'0'.repeat(maxDecimals - 1)}1` : wholeFormatted;
  }
  return `${wholeFormatted}.${trimmed}`;
};

const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

export const formatUsd = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return usdFormatter.format(value);
};

export const truncateAddress = (address: string | null | undefined, head = 6, tail = 4): string => {
  if (!address) return '';
  if (address.length <= head + tail + 3) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
};

const NETWORK_ERROR = /failed to fetch|networkerror|network request failed|err_|timeout|timed out|aborted/i;

export const errorMessage = (e: unknown): string => {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  if (!raw) return 'Something went wrong';
  // Browser fetch failures are opaque; say what the user can actually do.
  if (NETWORK_ERROR.test(raw)) return 'Network unreachable — check your connection and try again.';
  return raw;
};

/** Short, human-friendly relative time ("just now", "5m ago", "2d ago"). */
export const timeAgo = (iso: string | number): string => {
  const ts = typeof iso === 'number' ? iso : Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const diff = Math.max(0, Date.now() - ts) / 1000;
  if (diff < 45) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
};
