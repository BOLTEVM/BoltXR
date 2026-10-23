/**
 * Quai Network accounts, built on the official `quais` SDK.
 *
 * Accounts are derived exactly like Pelagus: BIP44 coin type 994 (the Quai
 * ledger), account 0, and address indices "ground" until the address lands in
 * the Cyprus-1 zone (first byte 0x00, Quai ledger bit clear). The same recovery
 * phrase therefore shows the same address in Pelagus and in Bolt XR, which is
 * what lets a player link the account they already use on BEAM.
 *
 * Grinding takes ~500 derivations per address on average (about a second in
 * JS), so the indices found are remembered in localStorage. Only the indices
 * are stored, under a hash of the account's public node — no keys, no
 * addresses — and each remembered index is re-checked by `addAddress`, which
 * refuses an index that does not land in the zone.
 *
 * Facts verified against the live nodes (see BEAM `packages/shared/src/chain/quai.ts`):
 *  - chain id 9 on mainnet, 15000 on Orchard, on every shard;
 *  - contract calls only work against a ZONE endpoint (…/cyprus1);
 *  - RPC rejects lowercase addresses ("address has invalid checksum").
 */

import {
  getAddress,
  getBytes,
  getZoneForAddress,
  isHexString,
  isQuaiAddress,
  JsonRpcProvider,
  Mnemonic,
  QuaiHDWallet,
  sha256,
  toUtf8Bytes,
  Wallet,
  Zone,
  type TypedDataDomain,
  type TypedDataField,
} from 'quais';
import { HDNodeWallet } from 'ethers';

// ── Networks ───────────────────────────────────────────────────────

export type QuaiNetworkKey = 'mainnet' | 'orchard';

export interface QuaiNetwork {
  key: QuaiNetworkKey;
  name: string;
  shortName: string;
  chainId: number;
  /** Cyprus-1 zone endpoint. */
  rpc: string;
  explorer: string;
  isTestnet: boolean;
}

export const QUAI_MAINNET_CHAIN_ID = 9;
export const QUAI_ORCHARD_CHAIN_ID = 15000;
export const QUAI_COIN_TYPE = 994;

/**
 * Development/test override for the RPC endpoints. The desktop app passes it
 * through its preload only in unpackaged builds (BOLTXR_QUAI_RPC_* env vars).
 */
const rpcOverride = (key: QuaiNetworkKey): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  const overrides = (window as unknown as { boltxrDesktop?: { quaiRpcOverrides?: Partial<Record<QuaiNetworkKey, string>> } })
    .boltxrDesktop?.quaiRpcOverrides;
  const url = overrides?.[key];
  return url && /^https?:\/\//.test(url) ? url : undefined;
};

const BASE_NETWORKS: Record<QuaiNetworkKey, QuaiNetwork> = {
  mainnet: {
    key: 'mainnet',
    name: 'Quai Network (Cyprus-1)',
    shortName: 'Quai Mainnet',
    chainId: QUAI_MAINNET_CHAIN_ID,
    rpc: 'https://rpc.quai.network/cyprus1',
    explorer: 'https://quaiscan.io',
    isTestnet: false,
  },
  orchard: {
    key: 'orchard',
    name: 'Quai Orchard Testnet (Cyprus-1)',
    shortName: 'Orchard Testnet',
    chainId: QUAI_ORCHARD_CHAIN_ID,
    rpc: 'https://orchard.rpc.quai.network/cyprus1',
    explorer: 'https://orchard.quaiscan.io',
    isTestnet: true,
  },
};

export const getQuaiNetwork = (key: QuaiNetworkKey): QuaiNetwork => {
  const base = BASE_NETWORKS[key];
  const rpc = rpcOverride(key);
  return rpc ? { ...base, rpc } : base;
};

export const QUAI_NETWORK_KEYS: QuaiNetworkKey[] = ['mainnet', 'orchard'];

export const quaiNetworkByChainId = (chainId: number): QuaiNetwork | null => {
  const key = QUAI_NETWORK_KEYS.find(k => BASE_NETWORKS[k].chainId === chainId);
  return key ? getQuaiNetwork(key) : null;
};

/** The wallet-side chain key (`CHAINS[...]`) for each network. */
export const QUAI_CHAIN_KEYS: Record<QuaiNetworkKey, string> = { mainnet: 'quai', orchard: 'quai_orchard' };

export const quaiNetworkForChainKey = (chainKey: string): QuaiNetwork | null => {
  const key = QUAI_NETWORK_KEYS.find(k => QUAI_CHAIN_KEYS[k] === chainKey);
  return key ? getQuaiNetwork(key) : null;
};

// ── Addresses ──────────────────────────────────────────────────────

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * A Quai-ledger address in the Cyprus-1 zone, the only zone Bolt XR and BEAM
 * transact on. Mixed-case input must carry a valid checksum.
 */
export const isCyprus1QuaiAddress = (address: string): boolean => {
  const clean = (address ?? '').trim();
  if (!HEX_ADDRESS.test(clean)) return false;
  try {
    const checksummed = getAddress(normaliseCase(clean));
    return getZoneForAddress(checksummed) === Zone.Cyprus1 && isQuaiAddress(checksummed);
  } catch {
    return false;
  }
};

/** Lowercase all-one-case input so getAddress computes (not verifies) the checksum. */
const normaliseCase = (address: string) => {
  const body = address.slice(2);
  return body === body.toLowerCase() || body === body.toUpperCase() ? address.toLowerCase() : address;
};

/** Checksummed Cyprus-1 address, or throws with a reason a person can act on. */
export const canonicalQuaiAddress = (address: string): string => {
  const clean = (address ?? '').trim();
  if (!HEX_ADDRESS.test(clean)) throw new Error('A Quai address is 0x followed by 40 hex characters.');
  let checksummed: string;
  try {
    checksummed = getAddress(normaliseCase(clean));
  } catch {
    throw new Error('Address checksum is invalid.');
  }
  if (getZoneForAddress(checksummed) !== Zone.Cyprus1) {
    throw new Error(`Address ${checksummed.slice(0, 6)}… is in another Quai zone. Bolt XR sends within Cyprus-1 (addresses starting 0x00).`);
  }
  if (!isQuaiAddress(checksummed)) throw new Error('That is a Qi address. Bolt XR sends QUAI to Quai-ledger addresses.');
  return checksummed;
};

// ── HD accounts (Pelagus-compatible) ───────────────────────────────

const INDEX_STORE_PREFIX = 'bolt_quai_idx_v1:';

interface AccountCache {
  hd: QuaiHDWallet;
  addresses: string[];
  storeKey: string;
}

// Lives only while the vault is unlocked; cleared by clearQuaiSession().
const accounts = new Map<string, AccountCache>();

const fingerprint = (mnemonic: string): string => {
  // The account-level public node identifies the phrase without revealing it.
  const node = HDNodeWallet.fromPhrase(mnemonic, undefined, `m/44'/${QUAI_COIN_TYPE}'/0'`).neuter();
  return sha256(toUtf8Bytes(node.extendedKey)).slice(2, 34);
};

const readIndices = (storeKey: string): number[] => {
  try {
    const raw = localStorage.getItem(storeKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < 2 ** 31) : [];
  } catch {
    return [];
  }
};

const writeIndices = (storeKey: string, indices: number[]) => {
  try { localStorage.setItem(storeKey, JSON.stringify(indices)); } catch { /* storage unavailable */ }
};

const accountFor = (mnemonic: string): AccountCache => {
  const id = fingerprint(mnemonic);
  let entry = accounts.get(id);
  if (!entry) {
    entry = {
      hd: QuaiHDWallet.fromMnemonic(Mnemonic.fromPhrase(mnemonic.trim())),
      addresses: [],
      storeKey: INDEX_STORE_PREFIX + id,
    };
    accounts.set(id, entry);
  }
  return entry;
};

/** Derive (or recall) the first `count` Cyprus-1 Quai addresses of account 0. */
const ensureAddresses = (mnemonic: string, count: number): AccountCache => {
  const entry = accountFor(mnemonic);
  if (entry.addresses.length >= count) return entry;

  const remembered = readIndices(entry.storeKey);
  let trusted = entry.addresses.length;
  while (entry.addresses.length < count && trusted < remembered.length) {
    try {
      const info = entry.hd.addAddress(0, remembered[trusted]);
      if (info.zone !== Zone.Cyprus1 || !isQuaiAddress(info.address)) break;
      entry.addresses.push(info.address);
      trusted++;
    } catch {
      break; // tampered or stale index: grind from here
    }
  }

  let ground = false;
  while (entry.addresses.length < count) {
    const info = entry.hd.getNextAddressSync(0, Zone.Cyprus1);
    entry.addresses.push(info.address);
    ground = true;
  }

  if (ground || trusted < remembered.length) {
    const indices = entry.addresses.map(a => entry.hd.getAddressInfo(a)?.index).filter((n): n is number => n !== undefined);
    writeIndices(entry.storeKey, indices);
  }
  return entry;
};

/** The Cyprus-1 Quai address of wallet `walletIndex` (Pelagus "Account walletIndex+1"). */
export const deriveQuaiAddress = (mnemonic: string, walletIndex: number): string =>
  ensureAddresses(mnemonic, walletIndex + 1).addresses[walletIndex];

/** BIP44 path actually used for a wallet's Quai address. */
export const quaiDerivationPath = (mnemonic: string, walletIndex: number): string => {
  const entry = ensureAddresses(mnemonic, walletIndex + 1);
  const info = entry.hd.getAddressInfo(entry.addresses[walletIndex]);
  return `m/44'/${QUAI_COIN_TYPE}'/0'/0/${info?.index ?? '?'}`;
};

/** Forget every derived key. Called when the vault locks. */
export const clearQuaiSession = () => {
  accounts.clear();
  providers.clear();
};

// ── RPC ────────────────────────────────────────────────────────────

const providers = new Map<string, JsonRpcProvider>();

const providerFor = (network: QuaiNetwork): JsonRpcProvider => {
  let provider = providers.get(network.rpc);
  if (!provider) {
    // One zone URL, no prime-chain discovery, network pinned (no chainId probing
    // loop), and one request per HTTP call: not every Quai endpoint accepts batches.
    provider = new JsonRpcProvider(network.rpc, network.chainId, { usePathing: false, staticNetwork: true, batchMaxCount: 1 } as never);
    providers.set(network.rpc, provider);
  }
  return provider;
};

let rpcId = 1;

/** Raw JSON-RPC against the zone endpoint (no SDK parsing of Quai blocks). */
export const quaiRpc = async <T = unknown>(network: QuaiNetwork, method: string, params: unknown[] = []): Promise<T> => {
  const response = await fetch(network.rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Quai RPC HTTP ${response.status}`);
  const body = await response.json() as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message ?? 'RPC error'}`);
  if (body.result === undefined) throw new Error(`${method}: empty response`);
  return body.result;
};

export const fetchQuaiBalance = async (network: QuaiNetwork, address: string): Promise<bigint> => {
  const hex = await quaiRpc<string>(network, 'quai_getBalance', [canonicalQuaiAddress(address), 'latest']);
  return BigInt(hex);
};

/** 'success' | 'failed' once mined, null while pending. */
export const fetchQuaiReceiptStatus = async (network: QuaiNetwork, hash: string): Promise<'success' | 'failed' | null> => {
  const receipt = await quaiRpc<{ status?: string } | null>(network, 'quai_getTransactionReceipt', [hash]).catch(() => null);
  if (!receipt || receipt.status === undefined) return null;
  return BigInt(receipt.status) === 1n ? 'success' : 'failed';
};

// ── Signing ────────────────────────────────────────────────────────

const signerFor = (mnemonic: string, walletIndex: number, network?: QuaiNetwork): Wallet => {
  const entry = ensureAddresses(mnemonic, walletIndex + 1);
  const key = entry.hd.getPrivateKey(entry.addresses[walletIndex]);
  return network ? new Wallet(key, providerFor(network)) : new Wallet(key);
};

/**
 * EIP-191 `personal_sign`. A 0x-hex message is signed as bytes (what quais and
 * Pelagus send); anything else as UTF-8 text.
 */
export const signQuaiMessage = async (mnemonic: string, walletIndex: number, message: string): Promise<string> => {
  const payload = isHexString(message) ? getBytes(message) : message;
  return signerFor(mnemonic, walletIndex).signMessage(payload);
};

export const signQuaiTypedData = async (
  mnemonic: string,
  walletIndex: number,
  domain: TypedDataDomain,
  types: Record<string, TypedDataField[]>,
  value: Record<string, unknown>,
): Promise<string> => {
  // The domain type is implied by `domain`; quais rejects it in `types`.
  const rest = Object.fromEntries(Object.entries(types).filter(([name]) => name !== 'EIP712Domain'));
  return signerFor(mnemonic, walletIndex).signTypedData(domain, rest, value);
};

export interface QuaiTxRequest {
  to: string;
  value?: bigint;
  data?: string;
  gasLimit?: bigint;
}

export interface QuaiSentTx {
  hash: string;
  from: string;
}

/** Sign and broadcast a Quai-ledger transaction within Cyprus-1. */
export const sendQuaiTransaction = async (
  mnemonic: string,
  walletIndex: number,
  network: QuaiNetwork,
  tx: QuaiTxRequest,
): Promise<QuaiSentTx> => {
  const signer = signerFor(mnemonic, walletIndex, network);
  const from = signer.address;
  const to = canonicalQuaiAddress(tx.to);
  const response = await signer.sendTransaction({
    from,
    to,
    value: tx.value ?? 0n,
    data: tx.data && tx.data !== '0x' ? tx.data : undefined,
    gasLimit: tx.gasLimit,
    chainId: network.chainId,
  });
  return { hash: response.hash, from };
};
