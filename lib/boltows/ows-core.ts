import { Buffer } from 'buffer';
import { ethers, wordlists } from 'ethers';
import { LangEn } from 'ethers/wordlists';
import * as bitcoin from 'bitcoinjs-lib';
import * as bip39 from 'bip39';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { isValidSuiAddress, toBase64 } from '@mysten/sui/utils';
import { SwapProvider, SwapQuote, SwapQuoteParams, BridgeQuoteParams, SwapError } from './swap-provider';
import { generateAddressQR, generateContractQR, parseQRPayload, fetchFromIPFS, generateQRCanvas } from '../qr-codec';
import { fetchABI, parseABIMethods } from '../abi-fetcher';
import { CHAINS as CORE_CHAINS, ChainConfig, getRpcUrls, resolveChainKey } from "./chains";

export type { SwapQuote, SwapQuoteParams, BridgeQuoteParams };
export { SwapError };
export { generateAddressQR, generateContractQR, parseQRPayload, fetchFromIPFS, generateQRCanvas };
export { fetchABI, parseABIMethods };

const bip32 = BIP32Factory(ecc);

// BOLT-09: Robust wordlist resolution to prevent "FAILED" errors in minified builds
const englishWordlist = (() => {
  try {
    const en = LangEn.wordlist();
    const registry = wordlists as Record<string, typeof en>;
    if (!registry.en) registry.en = en;
    return registry.en;
  } catch (e) {
    console.warn("BIP39 wordlist initialization warning:", e);
    return LangEn.wordlist();
  }
})();

const VAULT_KEY = 'bolt_vault_v1';
const GUARD_KEY = 'bolt_vault_guard_v1';
const FETCH_TIMEOUT_MS = 10_000;

// ── Errors ─────────────────────────────────────────────────────────

export class VaultLockedError extends Error {
  constructor() {
    super('Vault is locked');
    this.name = 'VaultLockedError';
  }
}

/** An error another RPC endpoint cannot fix (reverts, bad input, ...). */
class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

export class UnsupportedChainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedChainError';
  }
}

const errorMessage = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return 'Unknown error';
};

// ── Types ──────────────────────────────────────────────────────────

export interface ContractData {
  address: string;
  abi: string;
  name: string;
  decimals: number;
  chainId: string;
}

export interface NFTData {
  address: string;
  tokenId: string;
  name: string;
  symbol: string;
  tokenUri: string;
  metadata?: unknown;
  chainId: string;
}

export interface HistoryData {
  hash: string;
  type: 'send' | 'receive' | 'contract_call';
  from: string;
  to: string;
  value: string;
  asset: string;
  usdValue: string;
  timestamp: string;
  chainId: string;
  status: 'success' | 'failed' | 'pending';
}

export interface LogEvent {
  id: string;
  type: 'rpc' | 'security' | 'session' | 'fallback';
  message: string;
  status: 'success' | 'error' | 'warning' | 'info';
  timestamp: number;
  metadata?: Record<string, unknown>;
}

interface StoredWallet {
  id: string;
  name: string;
  index: number;
  createdAt: string;
}

interface VaultData {
  encryptedMnemonic: string;
  salt: string;
  iv: string;
  isEncrypted: boolean;
  wallets: StoredWallet[];
  contracts: ContractData[];
  nfts: NFTData[];
  history: HistoryData[];
  __mnemonic?: string;
}

export interface WalletData {
  id: string;
  name: string;
  address: string;
  index: number;
  createdAt?: string;
  accounts?: { chainId: string; address: string; derivationPath: string }[];
}

/**
 * A transaction request handed to the signer.
 * `value` is always expressed in the chain's base units (wei, mist, ...) as a
 * decimal or 0x-prefixed hex string — never as a human-readable decimal.
 */
export interface TxRequest {
  to: string;
  value?: string | bigint;
  data?: string;
  gasLimit?: string | number | bigint;
  nonce?: number;
}

export interface SignedTx {
  chainKey: string;
  from: string;
  hash?: string;
  /** Serialized signed transaction (EVM) or base64 signature (Sui). */
  signature: string;
  /** Base64 transaction bytes (Sui only). */
  txBytes?: string;
}

export interface UnlockGuard {
  failures: number;
  lockedUntil: number | null;
}

// Pyth Hermes API Constants
const HERMES_URL = "https://hermes.pyth.network/v2/updates/price/latest";
const PRICE_FEED_IDS: Record<string, string> = {
  "ethereum": "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  "bitcoin": "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  "bsc": "0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f",
  "polygon": "0xcc24d03da2d348003612f09d3c5f5905d49ac539fe38466e3ef6022e0325493b",
  "pulsechain": "0xecf55730022301c80fbbcc2c7199990e1f75323ddf069f21f64f77c8e96bf655",
  "sui": "0x50c18d9ef61730bb53c448eb3b054817a2e0a010899def360e4282367f08365a",
  "coredao": "0x1bf60fe662ecab2f06997df00c61f86778eaa158850043ae999971477f4a0f97",
  "tron": "0x386d389658f8446b3e15b57d0eb5f7f9011b93fdf9602a99d40b798e4d293223"
};

// NOTE: Tron intentionally keeps the EVM (coin type 60) path so existing
// vaults continue to resolve to the same Tron addresses.
const DERIVATION_PATHS: Record<string, string> = {
  "ethereum": "m/44'/60'/0'/0/",
  "bsc": "m/44'/60'/0'/0/",
  "polygon": "m/44'/60'/0'/0/",
  "pulsechain": "m/44'/60'/0'/0/",
  "quai": "m/44'/969'/0'/0/",
  "monad": "m/44'/60'/0'/0/",
  "bitcoin": "m/84'/0'/0'/0/",
  "sui": "m/44'/784'/0'/0'/",
  "xrpl_evm": "m/44'/60'/0'/0/",
  "tron_evm": "m/44'/60'/0'/0/",
  "coredao": "m/44'/60'/0'/0/"
};

const EVM_DEFAULT_PATH = "m/44'/60'/0'/0/";

export const CHAINS = CORE_CHAINS;
export type { ChainConfig } from "./chains";

const requireChain = (chainKey: string): ChainConfig => {
  const chain = CHAINS[chainKey];
  if (!chain) throw new Error(`Unknown chain: ${chainKey}`);
  return chain;
};

const derivationPathFor = (chainKey: string, index: number) => {
  const basePath = DERIVATION_PATHS[chainKey] || EVM_DEFAULT_PATH;
  // Sui uses fully hardened paths: m/44'/784'/0'/0'/{index}'
  const suffix = chainKey === 'sui' ? `${index}'` : `${index}`;
  return basePath.endsWith('/') ? `${basePath}${suffix}` : `${basePath}/${suffix}`;
};

// ── RPC helpers (fallback-aware) ───────────────────────────────────

const providerCache: Record<string, ethers.JsonRpcProvider> = {};
const healthyRpc: Record<string, string> = {};

const getProvider = (rpcUrl: string, chainId?: number) => {
  if (!rpcUrl) return null;
  const cacheKey = `${rpcUrl}#${chainId ?? ''}`;
  if (!providerCache[cacheKey]) {
    try {
      // A static network stops ethers from endlessly re-probing dead endpoints.
      providerCache[cacheKey] = chainId
        ? new ethers.JsonRpcProvider(rpcUrl, chainId, { staticNetwork: ethers.Network.from(chainId) })
        : new ethers.JsonRpcProvider(rpcUrl);
    } catch (e) {
      console.error("Provider Initialization Error:", e);
      return null;
    }
  }
  return providerCache[cacheKey];
};

/** Run `fn` against each RPC endpoint of an EVM-style chain until one succeeds. */
const withEvmProvider = async <T>(chainKey: string, fn: (provider: ethers.JsonRpcProvider) => Promise<T>): Promise<T> => {
  const chain = requireChain(chainKey);
  const urls = getRpcUrls(chainKey);
  const preferred = healthyRpc[chainKey];
  const ordered = preferred ? [preferred, ...urls.filter(u => u !== preferred)] : urls;
  let lastError: unknown = new Error(`No RPC endpoint configured for ${chain.name}`);

  for (const url of ordered) {
    const provider = getProvider(url, chain.chainId || undefined);
    if (!provider) continue;
    try {
      const result = await fn(provider);
      healthyRpc[chainKey] = url;
      return result;
    } catch (e) {
      lastError = e;
      // Contract reverts / invalid arguments won't be fixed by another endpoint.
      const code = (e as { code?: string })?.code;
      if (e instanceof NonRetryableError || code === 'CALL_EXCEPTION' || code === 'INVALID_ARGUMENT' || code === 'INSUFFICIENT_FUNDS' || code === 'NONCE_EXPIRED') {
        throw e;
      }
      logEvent('fallback', `${chain.name} RPC ${new URL(url).host} failed — trying next endpoint`, 'warning');
    }
  }
  throw lastError;
};

/** fetch() against each base URL in turn until one responds OK. */
const fetchWithFallback = async (chainKey: string, buildRequest: (baseUrl: string) => [string, RequestInit?]): Promise<Response> => {
  const urls = getRpcUrls(chainKey);
  let lastError: unknown = new Error(`No endpoint configured for ${chainKey}`);
  for (const base of urls) {
    try {
      const [url, init] = buildRequest(base);
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status} from ${new URL(url).host}`);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
};

const suiJsonRpc = async <T>(method: string, params: unknown[]): Promise<T> => {
  const response = await fetchWithFallback('sui', base => [base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }]);
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || 'Sui RPC error');
  return data.result as T;
};

// ── Session state ──────────────────────────────────────────────────

let sessionMnemonic: string | null = null;
// SEC-19: The PIN itself is never retained. Only a non-extractable AES key
// derived from it (plus the salt it was derived with) lives in memory.
let sessionKey: CryptoKey | null = null;
let sessionSalt: string | null = null;
let sessionLastActivity: number = 0;
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes auto-lock

const clearSession = () => {
  sessionMnemonic = null;
  sessionKey = null;
  sessionSalt = null;
};

// SEC-01: Session timeout — auto-lock after inactivity
const touchSession = () => { sessionLastActivity = Date.now(); };
const isSessionExpired = () => {
  if (!sessionMnemonic) return true;
  if (Date.now() - sessionLastActivity > SESSION_TIMEOUT_MS) {
    logEvent('security', 'Session expired — vault auto-locked', 'warning');
    clearSession();
    return true;
  }
  return false;
};

const requireUnlocked = (): string => {
  if (isSessionExpired() || !sessionMnemonic || !sessionKey) throw new VaultLockedError();
  return sessionMnemonic;
};

// ── BoltwalletCore ─────────────────────────────────────────────────

export class BoltwalletCore {
  private swapProvider = new SwapProvider();

  async getWallets(chainId: string) { return listWallets(chainId); }
  async listWallets(chainId: string) { return listWallets(chainId); }
  /** Addresses of one wallet on each requested chain (they differ for BTC/Sui/Tron). */
  async getWalletAddresses(walletId: string, chainKeys: string[]) { return getWalletAddresses(walletId, chainKeys); }
  async createNewWallet(name: string, chainId: string) { return createWallet(name, chainId); }
  async isVaultLocked() { return isVaultLocked(); }
  async unlockVault(password: string) { return unlockVault(password); }
  async isVaultSetup() { return isVaultSetup(); }
  async setupVault(password: string) { return setupVault(password); }
  lock() { lockVault(); }
  getUnlockGuard() { return getUnlockGuard(); }
  touch() { if (!isVaultLocked()) touchSession(); }

  /** Legacy helper: returns "0.00" when the balance cannot be fetched. */
  async getNativeBalance(address: string, chainId: string) {
    const rpc = CHAINS[chainId]?.rpc || '';
    return getNativeBalance(address, rpc, chainId);
  }
  /** Fetch a native balance, throwing when every endpoint fails. */
  async fetchNativeBalance(address: string, chainId: string) {
    return fetchNativeBalance(address, chainId);
  }
  async getContractBalance(contractAddress: string, walletAddress: string, decimals: number, chainId: string) {
    return withEvmProvider(chainId, async provider => {
      const contract = new ethers.Contract(contractAddress, ["function balanceOf(address) view returns (uint256)"], provider);
      const balance = await contract.balanceOf(walletAddress);
      return ethers.formatUnits(balance, decimals);
    }).catch(() => "0.00");
  }
  async getGasPriceEstimates(chainId: string) {
    const rpc = CHAINS[chainId]?.rpc || '';
    return getGasPriceEstimates(rpc);
  }
  async listContracts(chainId: string) { return listContracts(chainId); }
  async importContract(name: string, address: string, abi: string, decimals: number, chainId: string) {
    return importContract(name, address, abi, decimals, chainId);
  }
  async deleteContract(address: string, chainId: string) {
    return deleteContract(address, chainId);
  }
  async listNFTs(chainId: string) { return listNFTs(chainId); }
  async importNFT(address: string, tokenId: string, name: string, chainId: string) {
    return importNFT(address, tokenId, name, chainId);
  }
  async deleteNFT(address: string, tokenId: string, chainId: string) {
    return deleteNFT(address, tokenId, chainId);
  }
  async getAssetPrices() { return getAssetPrices(); }
  async getHistory(address: string, chainId: string) { return getHistory(address, chainId); }
  async signTransaction(walletId: string, chainId: string, tx: TxRequest) { return signTransaction(walletId, chainId, JSON.stringify(tx, bigintReplacer)); }
  async resetVault(mnemonic: string, pass: string) { return resetVault(mnemonic, pass); }
  async getSession() { return getSessionMnemonic(); }
  async revealMnemonic(password: string) { return revealMnemonic(password); }

  onLogs(cb: (l: LogEvent[]) => void) { return onLogs(cb); }
  getLogs() { return getLogs(); }

  /**
   * Sign and broadcast a transaction, recording its final status in history.
   * Returns the transaction hash / digest.
   */
  async sendTransaction(walletId: string, chainKey: string, tx: TxRequest): Promise<string> {
    const signed = await signTransaction(walletId, chainKey, JSON.stringify(tx, bigintReplacer));
    try {
      const hash = chainKey === 'sui'
        ? await this.broadcastSuiTransaction(signed)
        : await this.broadcastTransaction(chainKey, signed.signature);
      // Stays 'pending' until refreshHistoryStatuses() sees a receipt.
      if (signed.hash && signed.hash !== hash) await updateHistoryStatus(signed.hash, 'pending', hash);
      return hash;
    } catch (e) {
      if (signed.hash) await updateHistoryStatus(signed.hash, 'failed').catch(() => undefined);
      throw e;
    }
  }

  /** Resolve pending history entries against on-chain receipts. */
  async refreshHistoryStatuses(): Promise<void> {
    if (isVaultLocked()) return;
    const vault = await getVault();
    const pending = vault.history.filter(h => h.status === 'pending');
    if (pending.length === 0) return;

    let changed = false;
    await Promise.all(pending.map(async entry => {
      const chain = CHAINS[entry.chainId];
      try {
        if (chain?.kind === 'evm') {
          const receipt = await withEvmProvider(entry.chainId, provider => provider.getTransactionReceipt(entry.hash));
          if (receipt) {
            entry.status = receipt.status === 1 ? 'success' : 'failed';
            changed = true;
          }
        } else if (chain?.kind === 'sui') {
          const tx = await suiJsonRpc<{ effects?: { status?: { status: string } } }>(
            'sui_getTransactionBlock', [entry.hash, { showEffects: true }]
          );
          const status = tx?.effects?.status?.status;
          if (status) {
            entry.status = status === 'success' ? 'success' : 'failed';
            changed = true;
          }
        }
      } catch { /* not yet indexed or RPC unavailable — keep pending */ }
    }));

    if (changed && !isVaultLocked()) {
      // Merge onto a fresh copy so concurrent writes are not lost.
      const latest = await getVault();
      for (const entry of pending) {
        const target = latest.history.find(h => h.hash === entry.hash);
        if (target) target.status = entry.status;
      }
      await saveVault(latest);
    }
  }

  /**
   * Get a real-time swap quote from LI.FI aggregator.
   * All bridge/DEX providers unrestricted — optimal route returned.
   */
  async getSwapQuote(params: SwapQuoteParams): Promise<SwapQuote> {
    return this.swapProvider.getQuote(params);
  }

  /**
   * Execute a swap using validated quote calldata.
   * CRITICAL: No hardcoded router addresses — all routing from live quote.
   */
  async executeSwap(walletId: string, chainId: string, quote: SwapQuote): Promise<string> {
    if (!quote.transactionRequest?.to || !quote.transactionRequest?.data) {
      throw new SwapError('Invalid swap quote: missing transaction request data.', 'INVALID_QUOTE');
    }
    const chain = requireChain(chainId);
    if (quote.transactionRequest.chainId && chain.chainId && Number(quote.transactionRequest.chainId) !== chain.chainId) {
      throw new SwapError('Swap quote was issued for a different chain.', 'CHAIN_MISMATCH');
    }
    if (quote.approvalRequired) {
      throw new SwapError('This route requires a token approval, which Bolt XR does not sign yet.', 'APPROVAL_REQUIRED');
    }
    const gasLimit = quote.transactionRequest.gasLimit;
    return this.sendTransaction(walletId, chainId, {
      to: quote.transactionRequest.to,
      value: quote.transactionRequest.value || '0',
      data: quote.transactionRequest.data,
      gasLimit: gasLimit && BigInt(gasLimit) > 0n ? gasLimit : undefined,
    });
  }

  /**
   * Get a bridge quote for cross-chain transfers.
   */
  async getBridgeQuote(params: BridgeQuoteParams): Promise<SwapQuote> {
    return this.swapProvider.getBridgeQuote(params);
  }

  /**
   * Execute a cross-chain bridge using validated quote.
   */
  async executeBridge(walletId: string, chainId: string, quote: SwapQuote): Promise<string> {
    return this.executeSwap(walletId, chainId, quote);
  }

  /**
   * Check if an ERC20 approval is needed before swap/bridge.
   */
  async checkSwapApproval(tokenAddress: string, ownerAddress: string, spenderAddress: string, amount: string, chainKey: string) {
    return this.swapProvider.checkApproval(tokenAddress, ownerAddress, spenderAddress, amount, chainKey);
  }

  /**
   * Fetch tokens available for swap on a given chain.
   */
  async getSwapTokens(chainKey: string) {
    return this.swapProvider.getSupportedTokens(chainKey);
  }

  /**
   * Resolve an ENS name to an address with checksum validation.
   */
  async resolveName(name: string): Promise<string | null> {
    if (!name.includes('.')) return null;
    try {
      const resolved = await withEvmProvider('ethereum', provider => provider.resolveName(name));
      if (resolved && !ethers.isAddress(resolved)) {
        console.warn("ENS resolved to invalid address:", resolved);
        return null;
      }
      return resolved;
    } catch (err) {
      console.warn("ENS Resolution failed:", err);
      return null;
    }
  }

  /**
   * Broadcast a signed transaction. Bitcoin via Esplora, EVM via RPC.
   * CRITICAL: No simulated broadcasts — errors propagate.
   */
  async broadcastTransaction(chainId: string, signedHex: string): Promise<string> {
    logEvent('rpc', `Broadcasting transaction to ${chainId}...`, 'info');
    const chain = requireChain(chainId);

    // 1. Bitcoin Broadcasting (real — via Esplora API)
    if (chain.kind === 'bitcoin') {
      try {
        const response = await fetchWithFallback('bitcoin', base => [`${base}/tx`, { method: 'POST', body: signedHex }]);
        const txid = (await response.text()).trim();
        logEvent('rpc', `Bitcoin TX Broadcasted: ${txid}`, 'success');
        return txid;
      } catch (e) {
        throw new Error(`Bitcoin Broadcast Failed: ${errorMessage(e)}`);
      }
    }

    if (chain.kind === 'sui') {
      throw new Error('Sui transactions must be broadcast with their transaction bytes (use sendTransaction).');
    }

    if (chain.kind !== 'evm') {
      throw new UnsupportedChainError(`Broadcasting on ${chain.name} is not supported.`);
    }

    // 2. EVM Broadcasting
    try {
      const txResponse = await withEvmProvider(chainId, provider => provider.broadcastTransaction(signedHex));
      logEvent('rpc', `EVM TX Broadcasted: ${txResponse.hash}`, 'success');
      return txResponse.hash;
    } catch (e) {
      console.error("EVM Broadcast Error:", e);
      throw new Error(`EVM Broadcast Failed: ${errorMessage(e)}`);
    }
  }

  private async broadcastSuiTransaction(signed: SignedTx): Promise<string> {
    if (!signed.txBytes) throw new Error('Missing Sui transaction bytes');
    try {
      const result = await suiJsonRpc<{ digest?: string; effects?: { status?: { status: string; error?: string } } }>(
        'sui_executeTransactionBlock',
        [signed.txBytes, [signed.signature], { showEffects: true }, 'WaitForLocalExecution']
      );
      if (result.effects?.status?.status === 'failure') {
        throw new Error(result.effects.status.error || 'Execution failed');
      }
      const digest = result.digest || '';
      logEvent('rpc', `Sui TX Broadcasted: ${digest}`, 'success');
      return digest;
    } catch (e) {
      throw new Error(`Sui Broadcast Failed: ${errorMessage(e)}`);
    }
  }

  // ── QR Code & Contract Interaction Methods ─────────────────────

  /**
   * Execute a read-only (view/pure) contract method call.
   * Does NOT require signing — uses the chain's public RPC.
   */
  async callContractRead(
    contractAddress: string,
    abiJson: string,
    method: string,
    args: unknown[],
    chainId: string
  ): Promise<unknown> {
    const chainConfig = requireChain(chainId);
    if (chainConfig.kind !== 'evm') throw new Error(`${chainConfig.name} does not support EVM contract calls`);

    try {
      const abi = JSON.parse(abiJson);
      logEvent('rpc', `Calling ${method}() on ${contractAddress}`, 'info');
      const result = await withEvmProvider(chainId, provider => {
        const contract = new ethers.Contract(contractAddress, abi, provider);
        return contract.getFunction(method).staticCall(...args);
      });
      logEvent('rpc', `${method}() returned successfully`, 'success');
      return result;
    } catch (e) {
      logEvent('rpc', `Contract read failed: ${errorMessage(e)}`, 'error');
      throw new Error(`Contract read failed: ${errorMessage(e)}`);
    }
  }

  /**
   * Execute a state-changing contract method call.
   * Encodes the calldata, signs via the vault, and broadcasts.
   * `value` is the native amount in base units (wei).
   */
  async callContractWrite(
    walletId: string,
    contractAddress: string,
    abiJson: string,
    method: string,
    args: unknown[],
    chainId: string,
    value?: string
  ): Promise<string> {
    const chainConfig = requireChain(chainId);
    if (chainConfig.kind !== 'evm') throw new Error(`${chainConfig.name} does not support EVM contract calls`);

    try {
      const abi = JSON.parse(abiJson);
      const iface = new ethers.Interface(abi);
      const data = iface.encodeFunctionData(method, args);

      logEvent('security', `Encoding ${method}() calldata for signing...`, 'info');

      return await this.sendTransaction(walletId, chainId, {
        to: contractAddress,
        value: value || '0',
        data,
      });
    } catch (e) {
      logEvent('security', `Contract write failed: ${errorMessage(e)}`, 'error');
      throw new Error(`Contract write failed: ${errorMessage(e)}`);
    }
  }

  /**
   * Parse an ABI JSON string and return a UI-friendly list of callable methods.
   */
  getContractMethods(abiJson: string) {
    return parseABIMethods(abiJson);
  }

  /**
   * Auto-fetch a verified ABI by contract address from Sourcify/Etherscan.
   */
  async fetchContractABI(contractAddress: string, chainId: string) {
    logEvent('rpc', `Fetching ABI for ${contractAddress} on ${chainId}...`, 'info');
    const result = await fetchABI(contractAddress, chainId);
    if ('abi' in result) {
      logEvent('rpc', `ABI fetched from ${result.source}: ${result.name}`, 'success');
    } else {
      logEvent('rpc', `ABI fetch failed: ${result.message}`, 'warning');
    }
    return result;
  }

  /**
   * Export a stored contract as a QR code. Small ABIs are embedded directly in
   * the boltxr:// URI; larger ones reference an IPFS CID when pinning is configured.
   */
  async exportContractQR(address: string, chainId: string): Promise<{ dataUri: string; cid: string } | null> {
    const contracts = await listContracts(chainId);
    const contract = contracts.find(c => c.address.toLowerCase() === address.toLowerCase());
    if (!contract) {
      logEvent('rpc', `Contract ${address} not found in vault`, 'error');
      return null;
    }

    logEvent('rpc', `Generating QR for ${contract.name}...`, 'info');
    const result = await generateContractQR(
      contract.address,
      contract.name,
      contract.abi,
      contract.decimals,
      contract.chainId
    );
    logEvent('rpc', result.cid ? `QR generated with IPFS CID: ${result.cid}` : 'QR generated with embedded ABI', 'success');
    return result;
  }

  /**
   * Import a contract from a scanned QR payload string.
   * Uses the embedded ABI when present, then IPFS, then verified-source lookup.
   */
  async importContractFromQR(rawPayload: string): Promise<ContractData | null> {
    const payload = parseQRPayload(rawPayload);
    if (!payload || payload.type !== 'contract') {
      logEvent('rpc', 'Invalid QR payload — not a contract URI', 'error');
      return null;
    }

    const chainKey = resolveChainKey(payload.chainId);
    if (!chainKey) {
      logEvent('rpc', `QR references unknown chain "${payload.chainId}"`, 'error');
      return null;
    }

    logEvent('rpc', `Importing contract ${payload.name} from QR...`, 'info');

    let abiJson = payload.abiInline || null;
    if (!abiJson && payload.abiCid) {
      logEvent('rpc', `Fetching ABI from IPFS: ${payload.abiCid}...`, 'info');
      abiJson = await fetchFromIPFS(payload.abiCid);
    }

    if (!abiJson) {
      logEvent('rpc', 'No embedded ABI — trying verified-source lookup...', 'warning');
      const fetchResult = await fetchABI(payload.address, chainKey);
      if ('abi' in fetchResult) {
        abiJson = fetchResult.abi;
      }
    }

    if (!abiJson) {
      logEvent('rpc', 'Could not retrieve ABI from QR, IPFS or verification sources', 'error');
      return null;
    }

    const contractData = await importContract(
      payload.name,
      payload.address,
      abiJson,
      payload.decimals,
      chainKey
    );

    logEvent('rpc', `Contract ${payload.name} imported successfully`, 'success');
    return contractData;
  }
}

// ── Crypto Helpers ─────────────────────────────────────────────────
// SEC-02: Increased PBKDF2 iterations from 100K to 600K per OWASP 2023 guidance
const PBKDF2_ITERATIONS = 600000;

const deriveKey = async (password: string, salt: Uint8Array) => {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const base64ToBytes = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

const encryptWithKey = async (data: string, key: CryptoKey) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(data));
  return { encrypted: bytesToBase64(new Uint8Array(encrypted)), iv: bytesToBase64(iv) };
};

const decryptWithKey = async (encrypted: string, iv: string, key: CryptoKey) => {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(iv) as BufferSource },
    key,
    base64ToBytes(encrypted) as BufferSource
  );
  return new TextDecoder().decode(decrypted);
};

const bigintReplacer = (_key: string, value: unknown) => typeof value === 'bigint' ? value.toString() : value;

const toBigIntValue = (value: unknown, label: string): bigint => {
  if (value === undefined || value === null || value === '') return 0n;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error(`${label} must be an integer amount in base units`);
    return BigInt(value);
  }
  const str = String(value).trim();
  if (!/^(0x[0-9a-fA-F]+|\d+)$/.test(str)) {
    throw new Error(`${label} must be an integer amount in base units (got "${str}")`);
  }
  return BigInt(str);
};

const validateTransactionPayload = (tx: TxRequest) => {
  if (!tx.to) throw new Error("Transaction recipient (to) is missing");
  if (!ethers.isAddress(tx.to)) throw new Error("Invalid recipient address");

  const val = toBigIntValue(tx.value, 'Transaction value');
  if (val < 0n) throw new Error("Transaction value cannot be negative");

  if (tx.data && typeof tx.data === 'string' && tx.data !== '0x') {
    if (!/^0x[0-9a-fA-F]*$/.test(tx.data)) throw new Error("Transaction data must be a hex string starting with 0x");
    if (tx.data.length % 2 !== 0) throw new Error("Transaction data has invalid length");
  }
};

// SEC-18: Full vault encryption — encrypt entire vault structure, not just mnemonic.
// The vault is now stored as a single encrypted blob in localStorage.
// Only the 'isSetup' flag and encryption params are stored in cleartext.
interface EncryptedVaultEnvelope {
  encrypted: string;   // AES-GCM encrypted JSON of VaultData
  salt: string;
  iv: string;
  isSetup: boolean;
}

const readStoredVault = (): unknown => {
  if (typeof window === 'undefined') return null;
  const data = localStorage.getItem(VAULT_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};

const getVaultEnvelope = (): EncryptedVaultEnvelope | null => {
  const parsed = readStoredVault() as Partial<EncryptedVaultEnvelope & VaultData> | null;
  if (!parsed || parsed.encryptedMnemonic !== undefined) return null; // legacy format
  if (!parsed.encrypted || !parsed.salt || !parsed.iv) return null;
  return parsed as EncryptedVaultEnvelope;
};

const getLegacyVault = (): VaultData | null => {
  const parsed = readStoredVault() as Partial<VaultData> | null;
  if (parsed && parsed.encryptedMnemonic !== undefined) return parsed as VaultData;
  return null;
};

const initializeVault = (): VaultData => ({
  encryptedMnemonic: '',
  salt: '',
  iv: '',
  isEncrypted: true,
  wallets: [],
  contracts: [],
  nfts: [],
  history: []
});

/**
 * Load the decrypted vault for the active session.
 * SEC-20: Never fabricates an empty vault for an existing one — a decryption
 * failure throws so callers cannot accidentally persist an empty vault over it.
 */
const getVault = async (): Promise<VaultData> => {
  requireUnlocked();
  const envelope = getVaultEnvelope();
  if (envelope) {
    if (envelope.salt !== sessionSalt || !sessionKey) {
      // Vault was re-keyed elsewhere (e.g. another tab) — force a fresh unlock.
      clearSession();
      throw new VaultLockedError();
    }
    try {
      const decrypted = await decryptWithKey(envelope.encrypted, envelope.iv, sessionKey);
      const vault = JSON.parse(decrypted) as VaultData;
      return { ...initializeVault(), ...vault };
    } catch {
      throw new Error('Vault decryption failed — refusing to continue to protect your data');
    }
  }

  const legacy = getLegacyVault();
  if (legacy) return { ...initializeVault(), ...legacy };

  throw new Error('No vault found');
};

/** Encrypt and persist the vault. Only ever writes the encrypted envelope. */
const saveVault = async (data: VaultData) => {
  if (typeof window === 'undefined') return;
  if (!sessionKey || !sessionSalt) {
    // SEC-21: Never write a plaintext vault — it would overwrite the encrypted one.
    throw new VaultLockedError();
  }
  const encrypted = await encryptWithKey(JSON.stringify(data), sessionKey);
  const envelope: EncryptedVaultEnvelope = {
    encrypted: encrypted.encrypted,
    salt: sessionSalt,
    iv: encrypted.iv,
    isSetup: true,
  };
  localStorage.setItem(VAULT_KEY, JSON.stringify(envelope));
};

/** Derive a fresh key + salt for a new vault encryption context. */
const startSession = async (mnemonic: string, password: string) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  sessionKey = await deriveKey(password, salt);
  sessionSalt = bytesToBase64(salt);
  sessionMnemonic = mnemonic;
  touchSession();
};

// ── Unlock guard (SEC-22: persistent, escalating lockout) ─────────

const MAX_FREE_ATTEMPTS = 3;
const BASE_LOCKOUT_MS = 30_000;
const MAX_LOCKOUT_MS = 15 * 60 * 1000;

export const getUnlockGuard = (): UnlockGuard => {
  if (typeof window === 'undefined') return { failures: 0, lockedUntil: null };
  try {
    const raw = JSON.parse(localStorage.getItem(GUARD_KEY) || 'null');
    if (raw && typeof raw.failures === 'number') {
      return { failures: raw.failures, lockedUntil: typeof raw.lockedUntil === 'number' ? raw.lockedUntil : null };
    }
  } catch { /* corrupt guard — treat as fresh */ }
  return { failures: 0, lockedUntil: null };
};

const recordUnlockFailure = (): UnlockGuard => {
  const guard = getUnlockGuard();
  const failures = guard.failures + 1;
  let lockedUntil: number | null = null;
  if (failures >= MAX_FREE_ATTEMPTS) {
    const duration = Math.min(BASE_LOCKOUT_MS * 2 ** (failures - MAX_FREE_ATTEMPTS), MAX_LOCKOUT_MS);
    lockedUntil = Date.now() + duration;
  }
  const next = { failures, lockedUntil };
  localStorage.setItem(GUARD_KEY, JSON.stringify(next));
  logEvent('security', `Failed unlock attempt (${failures})`, 'warning');
  return next;
};

const resetUnlockGuard = () => {
  if (typeof window !== 'undefined') localStorage.removeItem(GUARD_KEY);
};

// ── Vault lifecycle ────────────────────────────────────────────────

export const MIN_NEW_PIN_LENGTH = 6;

export const setupVault = async (password: string): Promise<string> => {
  if (await isVaultSetup()) {
    throw new Error('A vault already exists on this device. Unlock it instead.');
  }
  if (!password || password.length < MIN_NEW_PIN_LENGTH) {
    throw new Error(`PIN must be at least ${MIN_NEW_PIN_LENGTH} digits`);
  }
  const wallet = ethers.Wallet.createRandom();
  const mnemonic = wallet.mnemonic?.phrase || '';
  if (!mnemonic) throw new Error('Failed to generate mnemonic');

  const vault = initializeVault();
  vault.__mnemonic = mnemonic;

  await startSession(mnemonic, password);
  await saveVault(vault);
  resetUnlockGuard();
  logEvent('security', 'New vault created', 'success');
  return mnemonic;
};

export const unlockVault = async (password: string): Promise<boolean> => {
  const guard = getUnlockGuard();
  if (guard.lockedUntil && Date.now() < guard.lockedUntil) return false;

  // Try new encrypted envelope format first
  const envelope = getVaultEnvelope();
  if (envelope && envelope.isSetup) {
    try {
      const key = await deriveKey(password, base64ToBytes(envelope.salt));
      const vault = JSON.parse(await decryptWithKey(envelope.encrypted, envelope.iv, key)) as VaultData;
      if (!vault.__mnemonic) throw new Error('Vault is missing its recovery phrase');
      sessionKey = key;
      sessionSalt = envelope.salt;
      sessionMnemonic = vault.__mnemonic;
      touchSession();
      resetUnlockGuard();
      logEvent('security', 'Vault unlocked', 'success');
      return true;
    } catch {
      recordUnlockFailure();
      return false;
    }
  }

  // Legacy fallback: old format with encryptedMnemonic
  const legacy = getLegacyVault();
  if (legacy && legacy.isEncrypted && legacy.encryptedMnemonic) {
    try {
      const legacyKey = await deriveKey(password, base64ToBytes(legacy.salt));
      const mnemonic = await decryptWithKey(legacy.encryptedMnemonic, legacy.iv, legacyKey);
      await startSession(mnemonic, password);
      // Migrate legacy vault to new encrypted format
      await saveVault({ ...initializeVault(), ...legacy, __mnemonic: mnemonic });
      resetUnlockGuard();
      logEvent('security', 'Vault migrated to full-encryption format', 'success');
      return true;
    } catch {
      clearSession();
      recordUnlockFailure();
      return false;
    }
  }

  return false;
};

export const lockVault = () => {
  if (sessionMnemonic) logEvent('security', 'Vault locked', 'info');
  clearSession();
};

export const isVaultLocked = () => {
  if (isSessionExpired()) return true;
  return !sessionMnemonic;
};

export const isVaultSetup = async () => {
  const envelope = getVaultEnvelope();
  if (envelope) return envelope.isSetup;
  const legacy = getLegacyVault();
  if (legacy) return legacy.isEncrypted;
  return false;
};

/** Re-verify the PIN and return the recovery phrase for backup. */
export const revealMnemonic = async (password: string): Promise<string | null> => {
  const guard = getUnlockGuard();
  if (guard.lockedUntil && Date.now() < guard.lockedUntil) return null;
  const envelope = getVaultEnvelope();
  if (!envelope) return null;
  try {
    const key = await deriveKey(password, base64ToBytes(envelope.salt));
    const vault = JSON.parse(await decryptWithKey(envelope.encrypted, envelope.iv, key)) as VaultData;
    return vault.__mnemonic || null;
  } catch {
    recordUnlockFailure();
    return null;
  }
};

// ── Logging ────────────────────────────────────────────────────────

let logs: LogEvent[] = [];
let logListeners: ((l: LogEvent[]) => void)[] = [];

export const logEvent = (type: LogEvent['type'], message: string, status: LogEvent['status'] = 'info', metadata?: Record<string, unknown>) => {
  const safeId = (Math.random().toString(36) + '00000000').substring(2, 11);
  const event: LogEvent = {
    id: safeId || String(Date.now()),
    type: type || 'fallback',
    message: message || "Unknown Event",
    status: status || 'info',
    metadata: metadata || {},
    timestamp: Date.now()
  };
  logs = [event, ...logs].slice(0, 100);
  logListeners.forEach(l => l(logs));
};

export const onLogs = (callback: (l: LogEvent[]) => void) => {
  logListeners.push(callback);
  callback(logs);
  return () => {
    logListeners = logListeners.filter(l => l !== callback);
  };
};

export const getLogs = () => logs;

// ── Addresses ──────────────────────────────────────────────────────

const PLACEHOLDER_ADDRESS = "0x0000000000000000000000000000000000000000";

export const deriveAddress = (mnemonic: string, index: number, chainId: string = 'ethereum'): string => {
  if (!mnemonic || mnemonic.trim() === "") {
    return PLACEHOLDER_ADDRESS;
  }

  const chain = CHAINS[chainId];
  const fullPath = derivationPathFor(chainId, index);

  try {
    // 1. EVM-compatible chains
    if (chain?.kind === 'evm') {
      const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, fullPath, englishWordlist);
      return wallet.address;
    }

    // 2. Bitcoin (SegWit BIP84 — native signing preserved)
    if (chain?.kind === 'bitcoin') {
      const seed = bip39.mnemonicToSeedSync(mnemonic);
      const root = bip32.fromSeed(seed);
      const child = root.derivePath(fullPath);
      const { address } = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(child.publicKey),
        network: bitcoin.networks.bitcoin
      });
      return address || PLACEHOLDER_ADDRESS;
    }

    // 3. Tron (Mainnet)
    if (chain?.kind === 'tron') {
      const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, fullPath, englishWordlist);
      // Tron uses the same key as EVM but prepends 0x41 and applies Base58Check
      const ethAddr = wallet.address.replace('0x', '41');
      const hash1 = ethers.sha256(ethers.getBytes('0x' + ethAddr));
      const hash2 = ethers.sha256(ethers.getBytes(hash1));
      const checksum = hash2.substring(2, 10);
      return ethers.encodeBase58(ethers.getBytes('0x' + ethAddr + checksum));
    }

    // 4. Sui (native Ed25519)
    if (chain?.kind === 'sui') {
      const keypair = Ed25519Keypair.deriveKeypair(mnemonic, fullPath);
      return keypair.getPublicKey().toSuiAddress();
    }

    return PLACEHOLDER_ADDRESS;
  } catch (e) {
    console.error("Address Derivation Error:", e);
    return PLACEHOLDER_ADDRESS;
  }
};

/** Convert a Base58Check Tron address (T...) to its 0x-prefixed EVM form. */
export const tronToHexAddress = (address: string): string => {
  const bytes = ethers.getBytes(ethers.toBeHex(ethers.decodeBase58(address), 25));
  if (bytes[0] !== 0x41) throw new Error('Not a Tron mainnet address');
  const payload = bytes.slice(0, 21);
  const checksum = ethers.sha256(ethers.sha256(payload)).substring(2, 10);
  if (ethers.hexlify(bytes.slice(21)).substring(2) !== checksum) throw new Error('Invalid Tron address checksum');
  return ethers.getAddress(ethers.hexlify(payload.slice(1)));
};

/** Validate a recipient address for the given chain. */
export const isValidAddressForChain = (address: string, chainKey: string): boolean => {
  const chain = CHAINS[chainKey];
  if (!chain || !address) return false;
  const trimmed = address.trim();
  switch (chain.kind) {
    case 'evm': return ethers.isAddress(trimmed);
    case 'sui': return isValidSuiAddress(trimmed);
    case 'bitcoin':
      try { bitcoin.address.toOutputScript(trimmed, bitcoin.networks.bitcoin); return true; } catch { return false; }
    case 'tron':
      try { tronToHexAddress(trimmed); return true; } catch { return false; }
    default: return false;
  }
};

const toWalletData = (w: StoredWallet, chainId: string): WalletData => {
  const address = sessionMnemonic ? deriveAddress(sessionMnemonic, w.index, chainId) : PLACEHOLDER_ADDRESS;
  return {
    id: w.id,
    name: w.name,
    address,
    index: w.index,
    accounts: [{ chainId, address, derivationPath: derivationPathFor(chainId, w.index) }],
    createdAt: w.createdAt
  };
};

export const createWallet = async (name: string, chainId: string = 'ethereum'): Promise<WalletData> => {
  requireUnlocked();
  const vault = await getVault();
  const index = vault.wallets.reduce((max, w) => Math.max(max, w.index + 1), 0);
  const idBytes = crypto.getRandomValues(new Uint8Array(4));
  const id = `wallet_${Array.from(idBytes, b => b.toString(16).padStart(2, '0')).join('')}`;

  const newWallet: StoredWallet = {
    id,
    name: name || `Wallet ${index + 1}`,
    index,
    createdAt: new Date().toISOString()
  };

  vault.wallets.push(newWallet);
  await saveVault(vault);
  touchSession();

  return toWalletData(newWallet, chainId);
};

export const listWallets = async (chainId: string = 'ethereum'): Promise<WalletData[]> => {
  if (isVaultLocked()) return [];
  const vault = await getVault();
  return vault.wallets.map(w => toWalletData(w, chainId));
};

export const getWalletAddresses = async (walletId: string, chainKeys: string[]): Promise<Record<string, string>> => {
  const mnemonic = requireUnlocked();
  const vault = await getVault();
  const wallet = vault.wallets.find(w => w.id === walletId);
  if (!wallet) throw new Error('Wallet not found');
  const addresses: Record<string, string> = {};
  for (const key of chainKeys) {
    const address = deriveAddress(mnemonic, wallet.index, key);
    if (address !== PLACEHOLDER_ADDRESS) addresses[key] = address;
  }
  return addresses;
};

const findWallet = (vault: VaultData, walletId: string, mnemonic: string): StoredWallet | undefined => {
  const byId = vault.wallets.find(x => x.id === walletId || x.name === walletId);
  if (byId) return byId;
  // Accept the wallet's own EVM address as an identifier.
  if (ethers.isAddress(walletId)) {
    return vault.wallets.find(x => deriveAddress(mnemonic, x.index, 'ethereum').toLowerCase() === walletId.toLowerCase());
  }
  return undefined;
};

const updateHistoryStatus = async (hash: string, status: HistoryData['status'], finalHash?: string) => {
  if (isVaultLocked()) return;
  const vault = await getVault();
  const entry = vault.history.find(h => h.hash === hash);
  if (!entry) return;
  entry.status = status;
  if (finalHash) entry.hash = finalHash;
  await saveVault(vault);
};

export const signTransaction = async (walletId: string, chainId: string, txHex: string): Promise<SignedTx> => {
  // SEC-01: Check session expiry before signing
  const mnemonic = requireUnlocked();
  touchSession();
  const chainConfig = requireChain(chainId);
  logEvent('security', `Signing transaction for ${chainConfig.name}...`, 'info');

  const vault = await getVault();
  const w = findWallet(vault, walletId, mnemonic);
  if (!w) throw new Error("Wallet not found");

  try {
    const txParams = JSON.parse(txHex) as TxRequest;
    const fullPath = derivationPathFor(chainId, w.index);

    if (!chainConfig.canSend) {
      throw new UnsupportedChainError(`Sending on ${chainConfig.name} is not supported yet.`);
    }

    // 1. Sui (Ed25519 — real transaction signing)
    if (chainConfig.kind === 'sui') {
      if (!isValidSuiAddress(txParams.to)) throw new Error('Invalid Sui recipient address');
      const amountMist = toBigIntValue(txParams.value, 'Transaction value');
      if (amountMist <= 0n) throw new Error('Amount must be greater than zero');

      const keypair = Ed25519Keypair.deriveKeypair(mnemonic, fullPath);
      const senderAddr = keypair.getPublicKey().toSuiAddress();

      const suiTx = new Transaction();
      suiTx.setSender(senderAddr);
      const [coin] = suiTx.splitCoins(suiTx.gas, [amountMist]);
      suiTx.transferObjects([coin], txParams.to);

      const client = new SuiJsonRpcClient({ url: getRpcUrls('sui')[0], network: 'mainnet' });
      const txBytes = await suiTx.build({ client });
      const { signature } = await keypair.signTransaction(txBytes);

      const digest = await suiTx.getDigest({ client });
      await recordHistory(vault, {
        hash: digest,
        from: senderAddr,
        to: txParams.to,
        value: ethers.formatUnits(amountMist, chainConfig.nativeCurrency.decimals),
        chainKey: chainId,
        isContractCall: false,
      });

      logEvent('security', `Sui transaction signed natively (Ed25519)`, 'success');
      return { chainKey: chainId, from: senderAddr, hash: digest, signature, txBytes: toBase64(txBytes) };
    }

    if (chainConfig.kind !== 'evm') {
      throw new UnsupportedChainError(`Sending on ${chainConfig.name} is not supported yet.`);
    }

    // 2. EVM Signing (ethers v6 HDNodeWallet)
    validateTransactionPayload(txParams);
    const hdWallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, fullPath, englishWordlist);
    const wallet = new ethers.Wallet(hdWallet.privateKey);
    const value = toBigIntValue(txParams.value, 'Transaction value');
    const data = txParams.data || '0x';
    const isContractCall = data !== '0x';

    // SEC-04: Live nonce, gas and fee data. Signing never falls back to guesses
    // that could produce a stuck or doomed transaction.
    const { nonce, gasLimit, fees } = await withEvmProvider(chainId, async provider => {
      const nonce = txParams.nonce ?? await provider.getTransactionCount(hdWallet.address, 'pending');

      let gasLimit: bigint;
      const requested = txParams.gasLimit !== undefined ? toBigIntValue(txParams.gasLimit, 'Gas limit') : 0n;
      if (requested > 0n) {
        gasLimit = requested;
      } else {
        try {
          const estimated = await provider.estimateGas({ to: txParams.to, value, data, from: hdWallet.address });
          gasLimit = estimated * 120n / 100n; // 20% safety buffer
        } catch (e) {
          if (!isContractCall) {
            gasLimit = 21000n;
          } else {
            const reason = (e as { shortMessage?: string })?.shortMessage || errorMessage(e);
            throw new NonRetryableError(`Gas estimation failed — the transaction would likely revert (${reason})`);
          }
        }
      }

      const feeData = await provider.getFeeData();
      const fees = feeData.maxFeePerGas && feeData.maxPriorityFeePerGas
        ? { type: 2, maxFeePerGas: feeData.maxFeePerGas, maxPriorityFeePerGas: feeData.maxPriorityFeePerGas }
        : { type: 0, gasPrice: feeData.gasPrice ?? ethers.parseUnits('1', 'gwei') };

      return { nonce, gasLimit, fees };
    });

    const signature = await wallet.signTransaction({
      to: txParams.to,
      value,
      data,
      nonce,
      gasLimit,
      chainId: chainConfig.chainId,
      ...fees,
    });

    const hash = ethers.keccak256(signature);
    await recordHistory(vault, {
      hash,
      from: hdWallet.address,
      to: txParams.to,
      value: ethers.formatUnits(value, chainConfig.nativeCurrency.decimals),
      chainKey: chainId,
      isContractCall,
    });

    logEvent('security', `Transaction signed successfully`, 'success');
    return { chainKey: chainId, from: hdWallet.address, hash, signature };
  } catch (e) {
    logEvent('security', `Signing Violation: ${errorMessage(e)}`, 'error');
    if (e instanceof UnsupportedChainError) throw e;
    throw new Error(`Signing failed: ${errorMessage(e)}`);
  }
};

const recordHistory = async (vault: VaultData, entry: {
  hash: string; from: string; to: string; value: string; chainKey: string; isContractCall: boolean;
}) => {
  const chainConfig = CHAINS[entry.chainKey];
  const record: HistoryData = {
    hash: entry.hash,
    type: entry.isContractCall ? 'contract_call' : 'send',
    from: entry.from,
    to: entry.to,
    value: entry.value,
    asset: chainConfig?.nativeCurrency.symbol || 'ETH',
    usdValue: '0.00',
    timestamp: new Date().toISOString(),
    chainId: entry.chainKey,
    status: 'pending'
  };
  vault.history = [record, ...(vault.history || [])].slice(0, 200);
  await saveVault(vault);
};

// ── Balances & pricing ─────────────────────────────────────────────

/** Fetch a native balance, formatted in whole units. Throws if every endpoint fails. */
export const fetchNativeBalance = async (address: string, chainKey: string): Promise<string> => {
  const chain = requireChain(chainKey);
  if (!address || address === PLACEHOLDER_ADDRESS) throw new Error('No address');
  const decimals = chain.nativeCurrency.decimals;

  switch (chain.kind) {
    case 'bitcoin': {
      const response = await fetchWithFallback(chainKey, base => [`${base}/address/${address}`]);
      const data = await response.json();
      const stats = data.chain_stats || {};
      const balanceSat = BigInt(stats.funded_txo_sum || 0) - BigInt(stats.spent_txo_sum || 0);
      return ethers.formatUnits(balanceSat, decimals);
    }
    case 'sui': {
      const result = await suiJsonRpc<{ totalBalance?: string }>('suix_getBalance', [address]);
      return ethers.formatUnits(BigInt(result?.totalBalance || '0'), decimals);
    }
    case 'tron': {
      // TronGrid's JSON-RPC accepts 0x addresses and reports balances in sun.
      const hexAddress = tronToHexAddress(address);
      const balance = await withEvmProvider(chainKey, provider => provider.getBalance(hexAddress));
      return ethers.formatUnits(balance, decimals);
    }
    case 'evm': {
      const balance = await withEvmProvider(chainKey, provider => provider.getBalance(address));
      return ethers.formatUnits(balance, decimals);
    }
    default:
      throw new UnsupportedChainError(`${chain.name} balances are not supported`);
  }
};

/** Legacy API: returns "0.00" when the balance cannot be fetched. */
export const getNativeBalance = async (address: string, _rpcUrl: string, chainId?: string): Promise<string> => {
  if (!address || typeof address !== 'string') return "0.00";
  try {
    return await fetchNativeBalance(address, chainId || 'ethereum');
  } catch (e) {
    console.warn("Balance Fetch Error:", errorMessage(e));
    return "0.00";
  }
};

const FALLBACK_GAS = {
  baseFee: '20',
  slow: { priorityFee: '1', maxFee: '21', speed: 'slow' },
  average: { priorityFee: '2', maxFee: '25', speed: 'average' },
  fast: { priorityFee: '5', maxFee: '35', speed: 'fast' }
};

export const getGasPriceEstimates = async (rpcUrl: string) => {
  const provider = getProvider(rpcUrl);
  if (!provider) return FALLBACK_GAS;

  try {
    const feeData = await provider.getFeeData();
    const baseFee = feeData.gasPrice || ethers.parseUnits('1', 'gwei');
    const tier = (priority: string, speed: string) => ({
      priorityFee: priority,
      maxFee: ethers.formatUnits(baseFee + ethers.parseUnits(priority, 'gwei'), 'gwei'),
      speed
    });

    return {
      baseFee: ethers.formatUnits(baseFee, 'gwei'),
      slow: tier('1', 'slow'),
      average: tier('2', 'average'),
      fast: tier('5', 'fast'),
    };
  } catch {
    return FALLBACK_GAS;
  }
};

/**
 * Estimate the network fee for a simple native transfer, in whole native units.
 * Returns null when it cannot be estimated (e.g. unsupported chain or RPC down).
 */
export const estimateTransferFee = async (chainKey: string): Promise<string | null> => {
  const chain = CHAINS[chainKey];
  if (!chain) return null;
  try {
    if (chain.kind === 'evm') {
      const feeData = await withEvmProvider(chainKey, provider => provider.getFeeData());
      const perGas = feeData.maxFeePerGas ?? feeData.gasPrice;
      if (!perGas) return null;
      return ethers.formatUnits(perGas * 21000n, chain.nativeCurrency.decimals);
    }
    if (chain.kind === 'sui') {
      const price = await suiJsonRpc<string>('suix_getReferenceGasPrice', []);
      // A simple split+transfer consumes roughly 2,000 computation units plus storage.
      return ethers.formatUnits(BigInt(price) * 2000n + 2_000_000n, chain.nativeCurrency.decimals);
    }
  } catch { /* fall through */ }
  return null;
};

export const getContractBalance = async (contractAddress: string, walletAddress: string, decimals: number, rpcUrl: string): Promise<string> => {
  const provider = getProvider(rpcUrl);
  if (!provider) return "0.00";

  try {
    const abi = ["function balanceOf(address) view returns (uint256)"];
    const contract = new ethers.Contract(contractAddress, abi, provider);
    const balance = await contract.balanceOf(walletAddress);
    return ethers.formatUnits(balance, decimals);
  } catch {
    return "0.00";
  }
};

export const getAssetPrices = async (): Promise<Record<string, number>> => {
  const prices: Record<string, number> = {};
  await Promise.all(Object.entries(PRICE_FEED_IDS).map(async ([chain, id]) => {
    if (!id || id === "0x") return;
    try {
      const response = await fetch(`${HERMES_URL}?ids[]=${id}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!response.ok) return;
      const data = await response.json();
      const feed = data.parsed?.[0];
      if (feed && feed.price) {
        const expo = feed.price.expo || 0;
        const priceVal = feed.price.price || "0";
        const price = Number(priceVal) * Math.pow(10, expo);
        if (Number.isFinite(price) && price > 0) prices[chain] = price;
      }
    } catch { /* price unavailable — UI shows balance without USD value */ }
  }));
  return prices;
};

// ── Contracts, NFTs & history ──────────────────────────────────────

export const importContract = async (name: string, address: string, abi: string, decimals: number, chainId: string) => {
  requireUnlocked();
  const chainKey = resolveChainKey(chainId);
  if (!chainKey) throw new Error(`Unknown chain: ${chainId}`);

  // SEC-09: Checksum-validate EVM addresses
  let checksumAddr: string;
  try {
    checksumAddr = ethers.getAddress(address.trim());
  } catch (e) {
    throw new Error(`Invalid contract address: ${errorMessage(e)}`);
  }

  // SEC-14: Validate ABI is a parseable JSON array (human-readable ABIs are normalized)
  let normalizedAbi: string;
  try {
    const parsed = JSON.parse(abi);
    if (!Array.isArray(parsed)) throw new Error('ABI must be a JSON array');
    normalizedAbi = parsed.every(entry => typeof entry === 'string')
      ? new ethers.Interface(parsed).formatJson()
      : JSON.stringify(parsed);
    // Throws on malformed fragments.
    new ethers.Interface(JSON.parse(normalizedAbi));
  } catch (e) {
    throw new Error(`Invalid ABI format: ${errorMessage(e)}`);
  }

  const safeDecimals = Number.isInteger(decimals) && decimals >= 0 && decimals <= 36 ? decimals : 18;
  const safeName = (name || '').trim().slice(0, 64) || 'Unnamed Contract';

  const vault = await getVault();
  if (!vault.contracts) vault.contracts = [];

  // SEC-11: Duplicate contract guard — prevent importing same address+chain twice
  const existing = vault.contracts.find(
    c => c.address.toLowerCase() === checksumAddr.toLowerCase() && c.chainId === chainKey
  );
  if (existing) {
    logEvent('rpc', `Contract ${checksumAddr} already imported on ${chainKey} — updating`, 'info');
    existing.name = safeName;
    existing.abi = normalizedAbi;
    existing.decimals = safeDecimals;
    await saveVault(vault);
    touchSession();
    return existing;
  }

  const newContract: ContractData = { name: safeName, address: checksumAddr, abi: normalizedAbi, decimals: safeDecimals, chainId: chainKey };
  vault.contracts.push(newContract);
  await saveVault(vault);
  touchSession();
  return newContract;
};

export const listContracts = async (chainId: string): Promise<ContractData[]> => {
  if (isVaultLocked()) return [];
  const vault = await getVault();
  return (vault.contracts || []).filter(c => c.chainId === chainId);
};

export const deleteContract = async (address: string, chainId: string) => {
  requireUnlocked();
  const vault = await getVault();
  vault.contracts = (vault.contracts || []).filter(
    c => !(c.address.toLowerCase() === address.toLowerCase() && c.chainId === chainId)
  );
  await saveVault(vault);
  touchSession();
};

export const importNFT = async (address: string, tokenId: string, name: string, chainId: string) => {
  requireUnlocked();
  const vault = await getVault();
  if (!vault.nfts) vault.nfts = [];
  const newNFT: NFTData = { address, tokenId, name, symbol: "NFT", tokenUri: "", chainId };
  vault.nfts.push(newNFT);
  await saveVault(vault);
  return newNFT;
};

export const listNFTs = async (chainId: string): Promise<NFTData[]> => {
  if (isVaultLocked()) return [];
  const vault = await getVault();
  return (vault.nfts || []).filter(n => n.chainId === chainId);
};

export const deleteNFT = async (address: string, tokenId: string, chainId: string) => {
  requireUnlocked();
  const vault = await getVault();
  vault.nfts = (vault.nfts || []).filter(n => !(n.address === address && n.tokenId === tokenId && n.chainId === chainId));
  await saveVault(vault);
};

export const getHistory = async (address: string, chainId: string): Promise<HistoryData[]> => {
  if (isVaultLocked()) return [];
  const vault = await getVault();
  const safeAddress = (address || '').toLowerCase();
  return (vault.history || []).filter(h =>
    (safeAddress === '' || h.from.toLowerCase() === safeAddress || h.to.toLowerCase() === safeAddress) &&
    (chainId === 'all' || h.chainId === chainId)
  );
};

/**
 * Replace the vault with one restored from a recovery phrase.
 * This is destructive by design — callers must confirm with the user first.
 */
export const resetVault = async (mnemonic: string, pass: string): Promise<void> => {
  const phrase = mnemonic.trim().toLowerCase().split(/\s+/).join(' ');
  if (!ethers.Mnemonic.isValidMnemonic(phrase, englishWordlist)) {
    throw new Error('Invalid recovery phrase');
  }
  if (!pass || pass.length < MIN_NEW_PIN_LENGTH) {
    throw new Error(`PIN must be at least ${MIN_NEW_PIN_LENGTH} digits`);
  }
  const vault = initializeVault();
  vault.__mnemonic = phrase;
  await startSession(phrase, pass);
  await saveVault(vault);
  resetUnlockGuard();
  logEvent('security', 'Vault restored from recovery phrase', 'success');
};

export const getSessionMnemonic = () => {
  // SEC-03: Check session expiry before exposing mnemonic
  if (isSessionExpired()) return null;
  touchSession();
  return sessionMnemonic;
};
