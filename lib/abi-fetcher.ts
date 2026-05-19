/**
 * ABI Fetcher — Auto-fetch verified smart contract ABIs by contract address.
 *
 * Supports multiple verification sources:
 * 1. Etherscan-family APIs (Etherscan, BscScan, PolygonScan, etc.)
 * 2. Sourcify (decentralized, covers all EVM chains)
 *
 * This module is additive — it does not modify existing contract storage logic.
 */

import { CHAINS } from './boltows/chains';

// ── Types ────────────────────────────────────────────────────────

export interface FetchedABI {
  abi: string;           // JSON string of the ABI array
  name: string;          // Contract name from verification metadata
  source: 'etherscan' | 'sourcify';
  verified: boolean;
}

export interface ABIFetchError {
  code: 'NOT_VERIFIED' | 'NETWORK_ERROR' | 'UNSUPPORTED_CHAIN' | 'INVALID_ADDRESS';
  message: string;
}

// ── Etherscan-family Explorer API Mapping ─────────────────────────

const EXPLORER_API_URLS: Record<string, string> = {
  ethereum: 'https://api.etherscan.io/api',
  bsc: 'https://api.bscscan.com/api',
  polygon: 'https://api.polygonscan.com/api',
  pulsechain: 'https://api.scan.pulsechain.com/api',
  coredao: 'https://openapi.coredao.org/api',
};

// ── Sourcify Base URL ────────────────────────────────────────────

const SOURCIFY_BASE = 'https://sourcify.dev/server';

// ── Main Fetcher ─────────────────────────────────────────────────

/**
 * Attempt to auto-fetch a verified ABI for the given contract address.
 * Tries Sourcify first (decentralized, broader coverage), then falls back
 * to the chain-specific Etherscan API.
 */
export async function fetchABI(
  contractAddress: string,
  chainKey: string
): Promise<FetchedABI | ABIFetchError> {
  // Validate address format
  if (!contractAddress || !contractAddress.startsWith('0x') || contractAddress.length !== 42) {
    return {
      code: 'INVALID_ADDRESS',
      message: `Invalid contract address: ${contractAddress}`,
    };
  }

  const chain = CHAINS[chainKey];
  if (!chain || chain.chainId === 0) {
    return {
      code: 'UNSUPPORTED_CHAIN',
      message: `Chain "${chainKey}" is not supported for ABI auto-fetch (non-EVM or unknown).`,
    };
  }

  // 1. Try Sourcify (decentralized, no API key needed)
  const sourcifyResult = await fetchFromSourcify(contractAddress, chain.chainId);
  if (sourcifyResult && 'abi' in sourcifyResult) {
    return sourcifyResult;
  }

  // 2. Try Etherscan-family API
  const explorerUrl = EXPLORER_API_URLS[chainKey];
  if (explorerUrl) {
    const etherscanResult = await fetchFromEtherscan(contractAddress, explorerUrl);
    if (etherscanResult && 'abi' in etherscanResult) {
      return etherscanResult;
    }
  }

  return {
    code: 'NOT_VERIFIED',
    message: `No verified ABI found for ${contractAddress} on ${chain.name}. The contract may not be verified. You can import the ABI manually.`,
  };
}

// ── Sourcify Fetcher ─────────────────────────────────────────────

async function fetchFromSourcify(
  address: string,
  chainId: number
): Promise<FetchedABI | null> {
  // Sourcify supports both full and partial matches
  const matchTypes = ['full_match', 'partial_match'];

  for (const matchType of matchTypes) {
    try {
      const url = `${SOURCIFY_BASE}/repository/contracts/${matchType}/${chainId}/${address}/metadata.json`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) continue;

      const metadata = await response.json();
      const abi = metadata.output?.abi;
      const contractName = Object.values(metadata.settings?.compilationTarget || {})[0] as string || 'Unknown Contract';

      if (abi && Array.isArray(abi)) {
        return {
          abi: JSON.stringify(abi),
          name: contractName,
          source: 'sourcify',
          verified: matchType === 'full_match',
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}

// ── Etherscan Fetcher ────────────────────────────────────────────

async function fetchFromEtherscan(
  address: string,
  apiBaseUrl: string
): Promise<FetchedABI | null> {
  try {
    // Public rate-limited endpoint (no API key — 1 call/5sec)
    const url = `${apiBaseUrl}?module=contract&action=getabi&address=${address}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const data = await response.json();

    if (data.status === '1' && data.result) {
      // Validate it's actually a JSON array
      try {
        const parsed = JSON.parse(data.result);
        if (!Array.isArray(parsed)) return null;

        // Try to also fetch the contract name
        const nameUrl = `${apiBaseUrl}?module=contract&action=getsourcecode&address=${address}`;
        let contractName = 'Verified Contract';
        try {
          const nameResponse = await fetch(nameUrl, {
            signal: AbortSignal.timeout(5000),
          });
          if (nameResponse.ok) {
            const nameData = await nameResponse.json();
            if (nameData.status === '1' && nameData.result?.[0]?.ContractName) {
              contractName = nameData.result[0].ContractName;
            }
          }
        } catch {
          // Name fetch is optional, continue with default
        }

        return {
          abi: data.result,
          name: contractName,
          source: 'etherscan',
          verified: true,
        };
      } catch {
        return null;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Parse an ABI JSON string and extract human-readable method signatures.
 * Returns a structured list of callable methods with their types.
 */
export function parseABIMethods(abiJson: string): {
  name: string;
  type: 'read' | 'write';
  stateMutability: string;
  inputs: { name: string; type: string }[];
  outputs: { name: string; type: string }[];
}[] {
  try {
    const abi = JSON.parse(abiJson);
    if (!Array.isArray(abi)) return [];

    return abi
      .filter((entry: any) => entry.type === 'function')
      .map((entry: any) => ({
        name: entry.name,
        type: (entry.stateMutability === 'view' || entry.stateMutability === 'pure')
          ? 'read' as const
          : 'write' as const,
        stateMutability: entry.stateMutability || 'nonpayable',
        inputs: (entry.inputs || []).map((inp: any) => ({
          name: inp.name || '',
          type: inp.type || '',
        })),
        outputs: (entry.outputs || []).map((out: any) => ({
          name: out.name || '',
          type: out.type || '',
        })),
      }));
  } catch {
    return [];
  }
}
