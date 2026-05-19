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

// ── URI Scheme Constants ─────────────────────────────────────────

const BOLTXR_SCHEME = 'boltxr://';
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
  /** IPFS CID pointing to the full ABI JSON */
  abiCid: string;
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
 * Upload JSON data to IPFS via a public pinning service.
 * Uses the nft.storage/web3.storage-compatible API pattern.
 * Falls back to a deterministic CID generation for offline/testing.
 */
export async function uploadToIPFS(data: string): Promise<string> {
  // Try Pinata public gateway first (no API key needed for small payloads)
  try {
    const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pinataContent: JSON.parse(data),
        pinataMetadata: {
          name: `boltxr-contract-${Date.now()}`,
        },
      }),
    });

    if (response.ok) {
      const result = await response.json();
      return result.IpfsHash;
    }
  } catch {
    // Fall through to local CID generation
  }

  // Fallback: Generate a deterministic hash-based pseudo-CID for offline use.
  // The ABI can still be stored locally in the vault alongside the CID.
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const hashArray = new Uint8Array(hashBuffer);
  let hex = '';
  for (let i = 0; i < hashArray.length; i++) {
    hex += hashArray[i].toString(16).padStart(2, '0');
  }
  // Return a pseudo-CID with "Qm" prefix to maintain format compatibility
  return `QmLocal${hex.substring(0, 40)}`;
}

/**
 * Fetch JSON content from IPFS using multiple gateway fallbacks.
 */
export async function fetchFromIPFS(cid: string): Promise<string | null> {
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

/**
 * Generate a QR code data URI for a wallet address.
 * Optionally wraps in EIP-681 `ethereum:` scheme for cross-wallet compatibility.
 */
export async function generateAddressQR(
  address: string,
  options?: { eip681?: boolean; chainId?: string; size?: number }
): Promise<string> {
  const { eip681 = false, chainId, size = 256 } = options || {};

  let payload = address;
  if (eip681 && address.startsWith('0x')) {
    payload = `${ETHEREUM_SCHEME}${address}`;
    if (chainId) {
      payload += `@${chainId}`;
    }
  }

  return QRCode.toDataURL(payload, {
    width: size,
    margin: 2,
    color: {
      dark: '#FFFFFF',
      light: '#00000000', // Transparent background for glassmorphic overlay
    },
    errorCorrectionLevel: 'M',
  });
}

/**
 * Generate a QR code for sharing a smart contract via IPFS CID.
 * The ABI is uploaded to IPFS and the QR encodes a compact boltxr:// URI.
 */
export async function generateContractQR(
  address: string,
  name: string,
  abi: string,
  decimals: number,
  chainId: string,
  options?: { size?: number }
): Promise<{ dataUri: string; cid: string }> {
  const { size = 256 } = options || {};

  // Upload ABI to IPFS
  const cid = await uploadToIPFS(abi);

  // Build the compact URI
  const params = new URLSearchParams({
    addr: address,
    name: name,
    dec: decimals.toString(),
    chain: chainId,
    cid: cid,
  });

  const uri = `${BOLTXR_CONTRACT_PREFIX}?${params.toString()}`;

  const dataUri = await QRCode.toDataURL(uri, {
    width: size,
    margin: 2,
    color: {
      dark: '#FFFFFF',
      light: '#00000000',
    },
    errorCorrectionLevel: 'M',
  });

  return { dataUri, cid };
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

      if (!addr || !name || !chain || !cid) return null;

      return {
        type: 'contract',
        address: addr,
        name: name,
        decimals: parseInt(dec || '18', 10),
        chainId: chain,
        abiCid: cid,
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
    color: {
      dark: '#FFFFFF',
      light: '#0f172a',
    },
    errorCorrectionLevel: 'M',
  });

  return canvas;
}
