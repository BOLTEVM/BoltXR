/**
 * QR Codec — QR code generation, scanning payload parsing, and IPFS CID encoding
 * for the Bolt XR Wallet.
 *
 * Supports:
 * - Wallet address QR generation (EIP-681 compatible)
 * - Smart contract data encoding via boltxr:// URI scheme with IPFS CID
 * - Payload parsing for both address and contract QR codes
 */

import QRCode from 'qrcode';
import { Interface } from 'ethers';
import { CHAINS, resolveChainKey } from './boltows/chains';

// ── URI Scheme Constants ─────────────────────────────────────────

const BOLTXR_CONTRACT_PREFIX = 'boltxr://contract';
const ETHEREUM_SCHEME = 'ethereum:';

// ── Types ────────────────────────────────────────────────────────

export interface QRAddressPayload {
  type: 'address';
  address: string;
  chainId?: string;
}

export interface QRContractPayload {
  type: 'contract';
  address: string;
  name: string;
  decimals: number;
  chainId: string;
  /** IPFS CID pointing to the full ABI JSON (optional when the ABI is embedded) */
  abiCid?: string;
  /** Optional inline ABI for small contracts (fallback if IPFS unavailable) */
  abiInline?: string;
}

export type QRPayload = QRAddressPayload | QRContractPayload;

// ── IPFS Utilities ───────────────────────────────────────────────

const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://dweb.link/ipfs/',
];

/**
 * Pin JSON data to IPFS via Pinata when a JWT is configured
 * (NEXT_PUBLIC_PINATA_JWT). Returns null when pinning is unavailable —
 * callers then embed the ABI in the QR or rely on verified-source lookup.
 */
export async function uploadToIPFS(data: string): Promise<string | null> {
  const jwt = process.env.NEXT_PUBLIC_PINATA_JWT;
  if (!jwt) return null;
  try {
    const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        pinataContent: JSON.parse(data),
        pinataMetadata: { name: `boltxr-contract-${Date.now()}` },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    const result = await response.json();
    return typeof result.IpfsHash === 'string' ? result.IpfsHash : null;
  } catch {
    return null;
  }
}

const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,})$/;

/**
 * Fetch JSON content from IPFS using multiple gateway fallbacks.
 */
export async function fetchFromIPFS(cid: string): Promise<string | null> {
  // Skip malformed or legacy locally-generated pseudo-CIDs ("QmLocal...").
  if (!CID_PATTERN.test(cid)) return null;
  for (const gateway of IPFS_GATEWAYS) {
    try {
      const response = await fetch(`${gateway}${cid}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        return await response.text();
      }
    } catch {
      continue;
    }
  }
  return null;
}

// ── QR Code Generation ──────────────────────────────────────────

const QR_COLORS = { dark: '#020617', light: '#FFFFFF' };

/** Build the payload encoded in an address QR (EIP-681 for EVM chains). */
export function buildAddressPayload(address: string, chainKey?: string): string {
  const chain = chainKey ? CHAINS[chainKey] : undefined;
  if (address.startsWith('0x') && (!chain || chain.kind === 'evm')) {
    // EIP-681 requires a numeric chain id.
    const numericId = chain && chain.chainId > 0 ? `@${chain.chainId}` : '';
    return `${ETHEREUM_SCHEME}${address}${numericId}`;
  }
  if (chain?.kind === 'bitcoin') return `bitcoin:${address}`;
  return address;
}

/**
 * Generate a QR code data URI for a wallet address.
 * Optionally wraps in EIP-681 `ethereum:` scheme for cross-wallet compatibility.
 */
export async function generateAddressQR(
  address: string,
  options?: { eip681?: boolean; chainId?: string; size?: number }
): Promise<string> {
  const { eip681 = false, chainId, size = 256 } = options || {};

  const payload = eip681 ? buildAddressPayload(address, resolveChainKey(chainId) || undefined) : address;

  return QRCode.toDataURL(payload, {
    width: size,
    margin: 2,
    // Dark modules on a light field: inverted codes fail on many phone scanners.
    color: QR_COLORS,
    errorCorrectionLevel: 'M',
  });
}

/** Max URI length we will encode (keeps QR density scannable). */
const MAX_QR_URI_LENGTH = 1800;

const toBase64Url = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (text: string) => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

/** Compact an ABI to human-readable function signatures. */
const compactAbi = (abi: string): string | null => {
  try {
    const iface = new Interface(JSON.parse(abi));
    const fns: string[] = [];
    iface.forEachFunction(fn => { fns.push(fn.format('minimal')); });
    return JSON.stringify(fns);
  } catch {
    return null;
  }
};

/**
 * Generate a QR code for sharing a smart contract.
 * The ABI's function signatures are embedded directly when they fit; otherwise
 * the ABI is pinned to IPFS (if configured) and referenced by CID. As a last
 * resort the receiver looks the ABI up from verified sources by address.
 */
export async function buildContractURI(
  address: string,
  name: string,
  abi: string,
  decimals: number,
  chainId: string
): Promise<{ uri: string; cid: string }> {
  const params = new URLSearchParams({
    addr: address,
    name: name,
    dec: decimals.toString(),
    chain: chainId,
  });

  const compact = compactAbi(abi);
  if (compact) {
    const withAbi = new URLSearchParams(params);
    withAbi.set('abi', toBase64Url(compact));
    const uri = `${BOLTXR_CONTRACT_PREFIX}?${withAbi.toString()}`;
    if (uri.length <= MAX_QR_URI_LENGTH) return { uri, cid: '' };
  }

  const cid = (await uploadToIPFS(abi)) || '';
  if (cid) params.set('cid', cid);
  return { uri: `${BOLTXR_CONTRACT_PREFIX}?${params.toString()}`, cid };
}

export async function generateContractQR(
  address: string,
  name: string,
  abi: string,
  decimals: number,
  chainId: string,
  options?: { size?: number }
): Promise<{ dataUri: string; cid: string; uri: string }> {
  const { size = 256 } = options || {};
  const { uri, cid } = await buildContractURI(address, name, abi, decimals, chainId);

  const dataUri = await QRCode.toDataURL(uri, {
    width: size,
    margin: 2,
    color: QR_COLORS,
    errorCorrectionLevel: 'M',
  });

  return { dataUri, cid, uri };
}

// ── QR Payload Parsing ──────────────────────────────────────────

/**
 * Parse a scanned QR code string into a typed payload.
 * Handles:
 * - boltxr://contract?... URIs
 * - ethereum:0x... EIP-681 URIs
 * - Plain hex addresses (0x...)
 * - Bitcoin addresses (bc1..., 1..., 3...)
 * - Sui addresses (0x... 64 chars)
 */
export function parseQRPayload(raw: string): QRPayload | null {
  const trimmed = raw.trim();

  // 1. boltxr://contract URI
  if (trimmed.startsWith(BOLTXR_CONTRACT_PREFIX)) {
    try {
      const url = new URL(trimmed.replace('boltxr://', 'https://boltxr.local/'));
      const addr = url.searchParams.get('addr');
      const name = url.searchParams.get('name');
      const dec = url.searchParams.get('dec');
      const chain = url.searchParams.get('chain');
      const cid = url.searchParams.get('cid');
      const abi = url.searchParams.get('abi');

      if (!addr || !name || !chain) return null;
      if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return null;

      let abiInline: string | undefined;
      if (abi) {
        try {
          const decoded = fromBase64Url(abi);
          if (Array.isArray(JSON.parse(decoded))) abiInline = decoded;
        } catch { /* ignore malformed embedded ABI */ }
      }

      const decimals = parseInt(dec || '18', 10);
      return {
        type: 'contract',
        address: addr,
        name: name.slice(0, 64),
        decimals: Number.isFinite(decimals) ? decimals : 18,
        chainId: chain,
        abiCid: cid || undefined,
        abiInline,
      };
    } catch {
      return null;
    }
  }

  // 2. EIP-681 ethereum: URI
  if (trimmed.startsWith(ETHEREUM_SCHEME)) {
    const addressPart = trimmed.replace(ETHEREUM_SCHEME, '').split(/[@?/]/)[0];
    const chainMatch = trimmed.match(/@(\d+)/);
    return {
      type: 'address',
      address: addressPart,
      chainId: chainMatch ? chainMatch[1] : undefined,
    };
  }

  // 2b. BIP21 bitcoin: URI
  if (trimmed.toLowerCase().startsWith('bitcoin:')) {
    const addressPart = trimmed.slice('bitcoin:'.length).split('?')[0];
    return { type: 'address', address: addressPart, chainId: 'bitcoin' };
  }

  // 3. Plain EVM address
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return { type: 'address', address: trimmed };
  }

  // 4. Bitcoin address (bech32, P2PKH, P2SH)
  if (/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(trimmed)) {
    return { type: 'address', address: trimmed, chainId: 'bitcoin' };
  }

  // 5. Sui address (0x + 64 hex chars)
  if (/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
    return { type: 'address', address: trimmed, chainId: 'sui' };
  }

  // 6. Unknown — try as generic address if it looks plausible
  if (trimmed.length >= 26 && trimmed.length <= 128 && /^[a-zA-Z0-9]+$/.test(trimmed)) {
    return { type: 'address', address: trimmed };
  }

  return null;
}

/**
 * Generate a raw canvas element with the QR code (for 3D CanvasTexture use).
 */
export async function generateQRCanvas(
  data: string,
  size: number = 256
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  await QRCode.toCanvas(canvas, data, {
    width: size,
    margin: 2,
    color: QR_COLORS,
    errorCorrectionLevel: 'M',
  });

  return canvas;
}
