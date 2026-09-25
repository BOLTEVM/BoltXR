import { ethers } from 'ethers';

/** Convert user-entered text into a typed ABI argument, with clear errors. */
export function parseAbiArg(type: string, raw: string, name?: string): unknown {
  const label = name ? `${name} (${type})` : type;
  const value = raw.trim();

  if (type.endsWith(']') || type.startsWith('tuple')) {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`${label}: enter a JSON value, e.g. ["0x…", "0x…"]`);
    }
  }
  if (/^u?int\d*$/.test(type)) {
    if (!/^-?\d+$/.test(value)) throw new Error(`${label}: enter a whole number`);
    const n = BigInt(value);
    if (type.startsWith('uint') && n < 0n) throw new Error(`${label}: must not be negative`);
    return n;
  }
  if (type === 'bool') {
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    throw new Error(`${label}: enter true or false`);
  }
  if (type === 'address') {
    if (!ethers.isAddress(value)) throw new Error(`${label}: invalid address`);
    return ethers.getAddress(value);
  }
  if (/^bytes\d*$/.test(type)) {
    if (!ethers.isHexString(value)) throw new Error(`${label}: enter 0x-prefixed hex`);
    return value;
  }
  return raw;
}

/** Render a contract call result (bigints, nested ethers Results) as text. */
export function formatAbiResult(result: unknown): string {
  const normalize = (v: unknown): unknown => {
    if (typeof v === 'bigint') return v.toString();
    if (Array.isArray(v)) return v.map(normalize);
    return v;
  };
  const value = normalize(result);
  if (Array.isArray(value) && value.length === 1) return typeof value[0] === 'string' ? value[0] : JSON.stringify(value[0]);
  return typeof value === 'string' ? value : JSON.stringify(value);
}
