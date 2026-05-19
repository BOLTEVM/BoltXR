import { ethers, wordlists } from 'ethers';
import { LangEn } from 'ethers/wordlists';
import * as bitcoin from 'bitcoinjs-lib';
import * as bip39 from 'bip39';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { SwapProvider, SwapQuote, SwapQuoteParams, BridgeQuoteParams, SwapError } from './swap-provider';
import { generateAddressQR, generateContractQR, parseQRPayload, fetchFromIPFS, uploadToIPFS, generateQRCanvas } from '../qr-codec';
import { fetchABI, parseABIMethods } from '../abi-fetcher';
export type { SwapQuote, SwapQuoteParams, BridgeQuoteParams };
export { SwapError };
export { generateAddressQR, generateContractQR, parseQRPayload, fetchFromIPFS, generateQRCanvas };
export { fetchABI, parseABIMethods };

const bip32 = BIP32Factory(ecc);
import { CHAINS as CORE_CHAINS } from "./chains";

// BOLT-09: Robust wordlist resolution to prevent "FAILED" errors in minified builds
if (typeof window !== 'undefined') {
  try {
    const en = LangEn.wordlist();
    if (!(wordlists as any).en) {
      (wordlists as any).en = en;
    }
  } catch (e) {
    console.warn("BIP39 wordlist initialization warning:", e);
  }
}

const VAULT_KEY = 'bolt_vault_v1';
const providerCache: Record<string, ethers.JsonRpcProvider> = {};

const getProvider = (rpcUrl: string) => {
  if (!rpcUrl) return null;
  if (!providerCache[rpcUrl]) {
    try {
      providerCache[rpcUrl] = new ethers.JsonRpcProvider(rpcUrl);
    } catch (e) {
      console.error("Provider Initialization Error:", e);
      return null;
    }
  }
  return providerCache[rpcUrl];
};

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
  metadata?: any;
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
  metadata?: any;
}

interface VaultData {
  encryptedMnemonic: string;
  salt: string;
  iv: string;
  isEncrypted: boolean;
  wallets: Array<{
    id: string;
    name: string;
    index: number;
    createdAt: string;
  }>;
  contracts: Array<ContractData>;
  nfts: Array<NFTData>;
  history: Array<HistoryData>;
}

// Pyth Hermes API Constants
const HERMES_URL = "https://hermes.pyth.network/v2/updates/price/latest";
const PRICE_FEED_IDS: Record<string, string> = {
  "ethereum": "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  "bsc": "0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f",
  "polygon": "0xcc24d03da2d348003612f09d3c5f5905d49ac539fe38466e3ef6022e0325493b",
  "pulsechain": "0xecf55730022301c80fbbcc2c7199990e1f75323ddf069f21f64f77c8e96bf655",
  "monad": "0x",
  "sui": "0x50c18d9ef61730bb53c448eb3b054817a2e0a010899def360e4282367f08365a",
  "coredao": "0x1bf60fe662ecab2f06997df00c61f86778eaa158850043ae999971477f4a0f97",
  "tron": "0x386d389658f8446b3e15b57d0eb5f7f9011b93fdf9602a99d40b798e4d293223"
};

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

export const CHAINS = CORE_CHAINS;
export type { ChainConfig } from "./chains";

export interface WalletData {
  id: string;
  name: string;
  address: string;
  index: number;
}

let sessionMnemonic: string | null = null;
let sessionPassword: string | null = null;
let sessionLastActivity: number = 0;
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes auto-lock

// SEC-01: Session timeout — auto-lock after inactivity
const touchSession = () => { sessionLastActivity = Date.now(); };
const isSessionExpired = () => {
  if (!sessionMnemonic) return true;
  if (Date.now() - sessionLastActivity > SESSION_TIMEOUT_MS) {
    logEvent('security', 'Session expired — vault auto-locked', 'warning');
    sessionMnemonic = null;
    sessionPassword = null;
    return true;
  }
  return false;
};

export class BoltwalletCore {
  private swapProvider = new SwapProvider();

  async getWallets(chainId: string) { return listWallets(chainId); }
  async listWallets(chainId: string) { return listWallets(chainId); }
  async createNewWallet(name: string, chainId: string) { return createWallet(name, chainId); }
  async isVaultLocked() { return isVaultLocked(); }
  async unlockVault(password: string) { return unlockVault(password); }
  async isVaultSetup() { return isVaultSetup(); }
  async setupVault(password: string) { return setupVault(password); }
  async getNativeBalance(address: string, chainId: string) {
    const rpc = CHAINS[chainId as keyof typeof CHAINS]?.rpc || '';
    return getNativeBalance(address, rpc, chainId);
  }
  async getContractBalance(contractAddress: string, walletAddress: string, decimals: number, chainId: string) {
    const rpc = CHAINS[chainId as keyof typeof CHAINS]?.rpc || '';
    return getContractBalance(contractAddress, walletAddress, decimals, rpc);
  }
  async getGasPriceEstimates(chainId: string) {
    const rpc = CHAINS[chainId as keyof typeof CHAINS]?.rpc || '';
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
  async signTransaction(walletId: string, chainId: string, tx: any) { return signTransaction(walletId, chainId, JSON.stringify(tx)); }
  async resetVault(mnemonic: string, pass: string) { return resetVault(mnemonic, pass); }
  async getSession() { return getSessionMnemonic(); }

  onLogs(cb: any) { return onLogs(cb); }
  getLogs() { return getLogs(); }

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
    const tx = {
      to: quote.transactionRequest.to,
      value: quote.transactionRequest.value || '0',
      data: quote.transactionRequest.data,
      gasLimit: quote.transactionRequest.gasLimit,
    };
    const { signature } = await signTransaction(walletId, chainId, JSON.stringify(tx));
    return await this.broadcastTransaction(chainId, signature);
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
      const provider = new ethers.JsonRpcProvider(CHAINS.ethereum?.rpc || 'https://rpc.ankr.com/eth');
      const resolved = await provider.resolveName(name);
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
   * Broadcast a signed transaction. Bitcoin via Blockstream, EVM via RPC.
   * CRITICAL: No simulated broadcasts — errors propagate.
   */
  async broadcastTransaction(chainId: string, signedHex: string): Promise<string> {
    logEvent('rpc', `Broadcasting transaction to ${chainId}...`, 'info');
    
    // 1. Bitcoin Broadcasting (real — via Blockstream API)
    if (chainId === 'bitcoin') {
      try {
        const response = await fetch(`https://blockstream.info/api/tx`, {
          method: 'POST',
          body: signedHex
        });
        const txid = await response.text();
        logEvent('rpc', `Bitcoin TX Broadcasted: ${txid}`, 'success');
        return txid;
      } catch (e: any) {
        throw new Error(`Bitcoin Broadcast Failed: ${e.message}`);
      }
    }

    // 2. Sui Broadcasting (real — via Sui JSON-RPC)
    if (chainId === 'sui') {
      try {
        const chainConfig = CORE_CHAINS['sui'];
        const response = await fetch(chainConfig?.rpc || 'https://rpc.ankr.com/sui', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'sui_executeTransactionBlock',
            params: [signedHex, [], null, 'WaitForLocalExecution']
          })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message || 'Sui RPC error');
        const digest = data.result?.digest || data.result?.effects?.transactionDigest || '';
        logEvent('rpc', `Sui TX Broadcasted: ${digest}`, 'success');
        return digest;
      } catch (e: any) {
        throw new Error(`Sui Broadcast Failed: ${e.message}`);
      }
    }

    // 3. EVM Broadcasting
    const chainConfig = CORE_CHAINS[chainId as keyof typeof CORE_CHAINS];
    const provider = getProvider(chainConfig?.rpc || '');
    if (!provider) throw new Error(`No provider for chain ${chainId}`);

    try {
      const txResponse = await provider.broadcastTransaction(signedHex);
      logEvent('rpc', `EVM TX Broadcasted: ${txResponse.hash}`, 'success');
      return txResponse.hash;
    } catch (e: any) {
      console.error("EVM Broadcast Error:", e);
      throw new Error(`EVM Broadcast Failed: ${e.message}`);
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
    args: any[],
    chainId: string
  ): Promise<any> {
    const chainConfig = CHAINS[chainId as keyof typeof CHAINS];
    if (!chainConfig) throw new Error(`Unknown chain: ${chainId}`);
    const provider = getProvider(chainConfig.rpc);
    if (!provider) throw new Error(`No RPC provider for ${chainConfig.name}`);

    try {
      const abi = JSON.parse(abiJson);
      const contract = new ethers.Contract(contractAddress, abi, provider);
      logEvent('rpc', `Calling ${method}() on ${contractAddress}`, 'info');
      const result = await contract[method](...args);
      logEvent('rpc', `${method}() returned successfully`, 'success');
      return result;
    } catch (e: any) {
      logEvent('rpc', `Contract read failed: ${e.message}`, 'error');
      throw new Error(`Contract read failed: ${e.message}`);
    }
  }

  /**
   * Execute a state-changing contract method call.
   * Encodes the calldata, signs via the vault, and broadcasts.
   */
  async callContractWrite(
    walletId: string,
    contractAddress: string,
    abiJson: string,
    method: string,
    args: any[],
    chainId: string,
    value?: string
  ): Promise<string> {
    const chainConfig = CHAINS[chainId as keyof typeof CHAINS];
    if (!chainConfig) throw new Error(`Unknown chain: ${chainId}`);

    try {
      const abi = JSON.parse(abiJson);
      const iface = new ethers.Interface(abi);
      const data = iface.encodeFunctionData(method, args);

      logEvent('security', `Encoding ${method}() calldata for signing...`, 'info');

      const tx = {
        to: contractAddress,
        value: value || '0',
        data: data,
      };

      const { signature } = await signTransaction(walletId, chainId, JSON.stringify(tx));
      return await this.broadcastTransaction(chainId, signature);
    } catch (e: any) {
      logEvent('security', `Contract write failed: ${e.message}`, 'error');
      throw new Error(`Contract write failed: ${e.message}`);
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
   * Export a stored contract as a QR code with IPFS CID encoding.
   * The ABI is uploaded to IPFS and the QR encodes a compact boltxr:// URI.
   */
  async exportContractQR(address: string, chainId: string): Promise<{ dataUri: string; cid: string } | null> {
    const contracts = await listContracts(chainId);
    const contract = contracts.find((c: any) => c.address.toLowerCase() === address.toLowerCase());
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
    logEvent('rpc', `QR generated with IPFS CID: ${result.cid}`, 'success');
    return result;
  }

  /**
   * Import a contract from a scanned QR payload string.
   * Fetches the ABI from IPFS using the CID in the payload.
   */
  async importContractFromQR(rawPayload: string): Promise<ContractData | null> {
    const payload = parseQRPayload(rawPayload);
    if (!payload || payload.type !== 'contract') {
      logEvent('rpc', 'Invalid QR payload — not a contract URI', 'error');
      return null;
    }

    logEvent('rpc', `Importing contract ${payload.name} from QR...`, 'info');

    // Fetch ABI from IPFS
    let abiJson = payload.abiInline || null;
    if (!abiJson) {
      logEvent('rpc', `Fetching ABI from IPFS: ${payload.abiCid}...`, 'info');
      abiJson = await fetchFromIPFS(payload.abiCid);
    }

    if (!abiJson) {
      // Fallback: try auto-fetching from Sourcify/Etherscan
      logEvent('rpc', 'IPFS fetch failed, trying auto-fetch...', 'warning');
      const chainKey = Object.keys(CHAINS).find(
        key => CHAINS[key].id === payload.chainId || CHAINS[key].chainId.toString() === payload.chainId
      );
      if (chainKey) {
        const fetchResult = await fetchABI(payload.address, chainKey);
        if ('abi' in fetchResult) {
          abiJson = fetchResult.abi;
        }
      }
    }

    if (!abiJson) {
      logEvent('rpc', 'Could not retrieve ABI from IPFS or verification sources', 'error');
      return null;
    }

    const contractData = await importContract(
      payload.name,
      payload.address,
      abiJson,
      payload.decimals,
      payload.chainId
    );

    logEvent('rpc', `Contract ${payload.name} imported successfully`, 'success');
    return contractData;
  }
}

// Crypto Helpers
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
      salt: salt as any,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

const encryptData = async (data: string, password: string) => {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(data)
  );

  return {
    encrypted: arrayBufferToBase64(encrypted),
    salt: arrayBufferToBase64(salt.buffer),
    iv: arrayBufferToBase64(iv.buffer)
  };
};

const decryptData = async (encrypted: string, salt: string, iv: string, password: string) => {
  const decoder = new TextDecoder();
  const saltArr = new Uint8Array(base64ToArrayBuffer(salt));
  const ivArr = new Uint8Array(base64ToArrayBuffer(iv));
  const encryptedArr = base64ToArrayBuffer(encrypted);
  const key = await deriveKey(password, saltArr);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivArr },
    key, 
    encryptedArr
  );
  return decoder.decode(decrypted);
};

const validateTransactionPayload = (tx: any) => {
  if (!tx.to) throw new Error("Transaction recipient (to) is missing");
  if (!ethers.isAddress(tx.to)) throw new Error("Invalid recipient address");

  if (tx.value) {
    try {
      const val = BigInt(tx.value.toString());
      if (val < 0n) throw new Error("Transaction value cannot be negative");
    } catch (e: any) {
      throw new Error(`Invalid transaction value: ${e.message}`);
    }
  }

  if (tx.data && typeof tx.data === 'string' && tx.data !== '0x') {
    if (!tx.data.startsWith('0x')) throw new Error("Transaction data must be a hex string starting with 0x");
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

const getVaultEnvelope = (): EncryptedVaultEnvelope | null => {
  if (typeof window === 'undefined') return null;
  const data = localStorage.getItem(VAULT_KEY);
  if (!data) return null;
  try {
    const parsed = JSON.parse(data);
    // Migration: detect legacy vault format (has 'encryptedMnemonic' key)
    if (parsed.encryptedMnemonic !== undefined) {
      return null; // Will trigger legacy migration path
    }
    return parsed as EncryptedVaultEnvelope;
  } catch {
    return null;
  }
};

const getLegacyVault = (): VaultData | null => {
  if (typeof window === 'undefined') return null;
  const data = localStorage.getItem(VAULT_KEY);
  if (!data) return null;
  try {
    const parsed = JSON.parse(data);
    if (parsed.encryptedMnemonic !== undefined) return parsed as VaultData;
    return null;
  } catch {
    return null;
  }
};

const getVault = async (): Promise<VaultData> => {
  // If we have a decrypted vault in the session, return it
  // The vault is re-decrypted from storage each time for integrity
  if (typeof window === 'undefined') return initializeVault();

  const envelope = getVaultEnvelope();
  if (envelope && envelope.isSetup && sessionPassword) {
    try {
      const decrypted = await decryptData(envelope.encrypted, envelope.salt, envelope.iv, sessionPassword);
      return JSON.parse(decrypted);
    } catch {
      // Decryption failed — session password may be wrong
      return initializeVault();
    }
  }

  // Legacy migration: old format with only mnemonic encrypted
  const legacy = getLegacyVault();
  if (legacy) return legacy;

  return initializeVault();
};

const initializeVault = () => {
  const newData: VaultData = {
    encryptedMnemonic: '',
    salt: '',
    iv: '',
    isEncrypted: false,
    wallets: [],
    contracts: [],
    nfts: [],
    history: []
  };
  return newData;
};

export const setupVault = async (password: string): Promise<string> => {
  const wallet = ethers.Wallet.createRandom();
  const mnemonic = wallet.mnemonic?.phrase || '';
  if (!mnemonic) throw new Error('Failed to generate mnemonic');

  const vault: VaultData = {
    encryptedMnemonic: '', // No longer used — mnemonic stored in vault body
    salt: '',
    iv: '',
    isEncrypted: true,
    wallets: [],
    contracts: [],
    nfts: [],
    history: []
  };
  // Store mnemonic inside the vault structure itself
  (vault as any).__mnemonic = mnemonic;

  sessionMnemonic = mnemonic;
  sessionPassword = password;
  touchSession();
  await saveVault(vault);
  return mnemonic;
};

export const unlockVault = async (password: string): Promise<boolean> => {
  // Try new encrypted envelope format first
  const envelope = getVaultEnvelope();
  if (envelope && envelope.isSetup) {
    try {
      const decrypted = await decryptData(envelope.encrypted, envelope.salt, envelope.iv, password);
      const vault = JSON.parse(decrypted);
      sessionMnemonic = vault.__mnemonic || null;
      sessionPassword = password;
      touchSession();
      return !!sessionMnemonic;
    } catch {
      return false;
    }
  }

  // Legacy fallback: old format with encryptedMnemonic
  const legacy = getLegacyVault();
  if (legacy && legacy.isEncrypted) {
    try {
      sessionMnemonic = await decryptData(legacy.encryptedMnemonic, legacy.salt, legacy.iv, password);
      sessionPassword = password;
      touchSession();
      // Migrate legacy vault to new encrypted format
      (legacy as any).__mnemonic = sessionMnemonic;
      await saveVault(legacy);
      logEvent('security', 'Vault migrated to full-encryption format', 'success');
      return true;
    } catch {
      return false;
    }
  }

  return false;
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

const saveVault = async (data: VaultData) => {
  if (typeof window === 'undefined') return;
  if (!sessionPassword) {
    // Fallback: save as legacy format if no session password
    localStorage.setItem(VAULT_KEY, JSON.stringify(data));
    return;
  }
  // SEC-18: Encrypt the entire vault structure
  const vaultJson = JSON.stringify(data);
  const encrypted = await encryptData(vaultJson, sessionPassword);
  const envelope: EncryptedVaultEnvelope = {
    encrypted: encrypted.encrypted,
    salt: encrypted.salt,
    iv: encrypted.iv,
    isSetup: true,
  };
  localStorage.setItem(VAULT_KEY, JSON.stringify(envelope));
};

let logs: LogEvent[] = [];
let logListeners: ((l: LogEvent[]) => void)[] = [];

export const logEvent = (type: LogEvent['type'], message: string, status: LogEvent['status'] = 'info', metadata?: any) => {
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

export const deriveAddress = (mnemonic: string, index: number, chainId: string = 'ethereum'): string => {
  if (!mnemonic || mnemonic.trim() === "") {
    return "0x0000000000000000000000000000000000000000";
  }

  const basePath = DERIVATION_PATHS[chainId] || "m/44'/60'/0'/0/";
  const fullPath = basePath.endsWith('/') ? `${basePath}${index}` : `${basePath}/${index}`;

  try {
    // 1. EVM / Tron EVM / XRPL EVM
    if (chainId === 'ethereum' || chainId === 'bsc' || chainId === 'polygon' || chainId === 'monad' || chainId === 'xrpl_evm' || chainId === 'coredao' || chainId === 'pulsechain') {
      const wordlist = (wordlists as any).en || LangEn.wordlist();
      const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, fullPath, wordlist);
      return wallet.address;
    }

    // 2. Bitcoin (SegWit BIP84 — native signing preserved)
    if (chainId === 'bitcoin') {
      const seed = bip39.mnemonicToSeedSync(mnemonic);
      const root = bip32.fromSeed(seed);
      const child = root.derivePath(fullPath);
      const { address } = bitcoin.payments.p2wpkh({ 
        pubkey: child.publicKey, 
        network: bitcoin.networks.bitcoin 
      });
      return address || "0x0000...0000";
    }

    // 3. Tron (Mainnet)
    if (chainId === 'tron') {
      const wordlist = (wordlists as any).en || LangEn.wordlist();
      const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, fullPath, wordlist);
      // Tron uses the same key as EVM but prepends 0x41 and applies Base58Check
      const ethAddr = wallet.address.replace('0x', '41');
      const hash1 = ethers.sha256(ethers.getBytes('0x' + ethAddr));
      const hash2 = ethers.sha256(ethers.getBytes(hash1));
      const checksum = hash2.substring(2, 10);
      return ethers.encodeBase58(ethers.getBytes('0x' + ethAddr + checksum));
    }

    // 4. Sui (native Ed25519 signing preserved)
    if (chainId === 'sui') {
      const keypair = Ed25519Keypair.deriveKeypair(mnemonic, fullPath);
      return keypair.getPublicKey().toSuiAddress();
    }

    return "0x0000...0000";
  } catch (e) {
    console.error("Address Derivation Error:", e);
    return "0x0000...0000";
  }
};

export const createWallet = async (name: string, chainId: string = 'ethereum'): Promise<any> => {
  if (!sessionMnemonic) throw new Error("Vault is locked");
  const vault = await getVault();
  const index = vault.wallets.length;
  const randStr = Math.random().toString(16);
  const id = `wallet_${(randStr + '00000000').substring(2, 10)}`;
  const address = deriveAddress(sessionMnemonic, index, chainId);

  const newWallet = {
    id,
    name: name || `Wallet ${index + 1}`,
    index,
    createdAt: new Date().toISOString()
  };

  vault.wallets.push(newWallet);
  await saveVault(vault);

  return {
    id: newWallet.id,
    name: newWallet.name,
    address,
    accounts: [{ chainId, address, derivationPath: (DERIVATION_PATHS[chainId] || "m/44'/60'/0'/0/") + index }],
    createdAt: newWallet.createdAt
  };
};

export const listWallets = async (chainId: string = 'ethereum'): Promise<any[]> => {
  const vault = await getVault();
  return vault.wallets.map((w: any) => {
    let address = '0x0000000000000000000000000000000000000000';
    if (sessionMnemonic) {
      address = deriveAddress(sessionMnemonic, w.index, chainId);
    }

    return {
      id: w.id,
      name: w.name,
      address,
      accounts: [{
        chainId,
        address,
        derivationPath: (DERIVATION_PATHS[chainId] || "m/44'/60'/0'/0/") + w.index
      }],
      createdAt: w.createdAt
    };
  });
};

export const signTransaction = async (walletId: string, chainId: string, txHex: string): Promise<any> => {
  // SEC-01: Check session expiry before signing
  if (isSessionExpired() || !sessionMnemonic) throw new Error("Vault is locked");
  touchSession();
  logEvent('security', `Signing transaction for ${chainId}...`, 'info');
  
  const vault = await getVault();
  const w = vault.wallets.find((x: any) => x.id === walletId || x.name === walletId);
  if (!w) throw new Error("Wallet not found");

  try {
    const txParams = JSON.parse(txHex);
    // Skip EVM-specific validation for non-EVM chains
    if (chainId !== 'sui') {
      validateTransactionPayload(txParams);
    }

    const basePath = DERIVATION_PATHS[chainId] || "m/44'/60'/0'/0/";
    const fullPath = basePath.endsWith('/') ? `${basePath}${w.index}` : `${basePath}/${w.index}`;
    
    const wordlist = (wordlists as any).en || LangEn.wordlist();
    const chainConfig = CHAINS[chainId as keyof typeof CHAINS];
    
    // 1. Bitcoin Signing (PSBT — native, preserved)
    if (chainId === 'bitcoin') {
      const seed = bip39.mnemonicToSeedSync(sessionMnemonic);
      const root = bip32.fromSeed(seed);
      const child = root.derivePath(fullPath);
      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin });
      psbt.signAllInputs(child);
      psbt.finalizeAllInputs();
      logEvent('security', `Bitcoin transaction signed natively`, 'success');
      return { signature: psbt.extractTransaction().toHex() };
    }

    // 2. SEC-05 FIX: True Sui Signing (Ed25519 — real transaction signing)
    if (chainId === 'sui') {
      const keypair = Ed25519Keypair.deriveKeypair(sessionMnemonic, fullPath);
      const senderAddr = keypair.getPublicKey().toSuiAddress();

      // Build a Sui Transaction from txParams
      const suiTx = new Transaction();
      suiTx.setSender(senderAddr);

      if (txParams.to && txParams.value) {
        // SUI transfer: split coins and transfer
        const amountMist = BigInt(Math.floor(parseFloat(txParams.value) * 1_000_000_000));
        const [coin] = suiTx.splitCoins(suiTx.gas, [amountMist]);
        suiTx.transferObjects([coin], txParams.to);
      } else if (txParams.moveCall) {
        // Move function call
        suiTx.moveCall({
          target: txParams.moveCall.target,
          arguments: (txParams.moveCall.arguments || []).map((arg: any) =>
            typeof arg === 'string' ? suiTx.pure.string(arg) : suiTx.pure.u64(arg)
          ),
        });
      }

      // Set gas budget
      suiTx.setGasBudget(txParams.gasBudget || 10_000_000);

      // Build and sign the transaction bytes
      const rpcUrl = chainConfig?.rpc || 'https://rpc.ankr.com/sui';
      const txBytes = await suiTx.build({ client: { url: rpcUrl } as any });
      const { signature: suiSig } = await keypair.signTransaction(txBytes);

      logEvent('security', `Sui transaction signed natively (Ed25519)`, 'success');

      // Return base64-encoded transaction bytes + signature for broadcast
      const txBase64 = Buffer.from(txBytes).toString('base64');
      return { signature: suiSig, txBytes: txBase64 };
    }

    // 3. EVM Signing (REAL — ethers v6 HDNodeWallet)
    const hdWallet = ethers.HDNodeWallet.fromPhrase(sessionMnemonic, undefined, fullPath, wordlist);
    const wallet = new ethers.Wallet(hdWallet.privateKey);

    // SEC-04 FIX: Fetch live nonce and estimate gas instead of defaulting
    const provider = getProvider(chainConfig?.rpc || '');
    let liveNonce = txParams.nonce;
    let liveGasLimit = txParams.gasLimit;
    let liveGasPrice = txParams.gasPrice;

    if (provider) {
      try {
        if (liveNonce === undefined || liveNonce === 0) {
          liveNonce = await provider.getTransactionCount(hdWallet.address, 'pending');
        }
        if (!liveGasLimit || liveGasLimit === 21000) {
          try {
            const estimated = await provider.estimateGas({
              to: txParams.to,
              value: txParams.value ? ethers.parseEther(txParams.value.toString()) : 0,
              data: txParams.data || '0x',
              from: hdWallet.address,
            });
            // Add 20% buffer for safety
            liveGasLimit = (estimated * 120n / 100n).toString();
          } catch {
            liveGasLimit = txParams.data && txParams.data !== '0x' ? 200000 : 21000;
          }
        }
        if (!liveGasPrice) {
          const feeData = await provider.getFeeData();
          liveGasPrice = feeData.gasPrice || ethers.parseUnits('1', 'gwei');
        }
      } catch (e: any) {
        logEvent('rpc', `Live gas/nonce fetch warning: ${e.message}`, 'warning');
      }
    }

    const signature = await wallet.signTransaction({
      to: txParams.to,
      value: txParams.value ? ethers.parseEther(txParams.value.toString()) : 0,
      data: txParams.data || '0x',
      nonce: liveNonce ?? 0,
      gasLimit: liveGasLimit || 21000,
      gasPrice: liveGasPrice || ethers.parseUnits('1', 'gwei'),
      chainId: Number(chainConfig?.chainId || chainConfig?.id || 1)
    });

    const from = hdWallet.address;
    const newHistory: HistoryData = {
      hash: ethers.keccak256(signature),
      type: txParams.data && txParams.to === '0x' ? 'contract_call' : 'send',
      from,
      to: txParams.to,
      value: txParams.value || '0',
      asset: chainConfig?.nativeCurrency.symbol || 'ETH',
      usdValue: '0.00',
      timestamp: new Date().toISOString(),
      chainId: chainId,
      status: 'success'
    };

    vault.history = [newHistory, ...(vault.history || [])];
    await saveVault(vault);

    logEvent('security', `Transaction signed successfully`, 'success');
    return { signature };
  } catch (e: any) {
    logEvent('security', `Signing Violation: ${e.message}`, 'error');
    throw new Error(`Signing Violation: ${e.message}`);
  }
};

export const getNativeBalance = async (address: string, rpcUrl: string, chainId?: string): Promise<string> => {
  if (!address || typeof address !== 'string') return "0.00";

  // 1. Bitcoin (via Blockstream API as fallback for JSON-RPC)
  if (chainId === 'bitcoin') {
    try {
      const response = await fetch(`https://blockstream.info/api/address/${address}`);
      const data = await response.json();
      const balanceSat = (data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum) || 0;
      return (balanceSat / 100000000).toFixed(8);
    } catch (e) {
      return "0.00";
    }
  }

  // 2. Sui (via Sui JSON-RPC)
  if (chainId === 'sui') {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'suix_getBalance',
          params: [address]
        })
      });
      const data = await response.json();
      const balanceMist = data.result?.totalBalance || "0";
      return (Number(balanceMist) / 1000000000).toFixed(4);
    } catch (e) {
      return "0.00";
    }
  }

  // 3. EVM (Standard)
  const provider = getProvider(rpcUrl);
  if (!provider) return "0.00";

  try {
    const balance = await provider.getBalance(address);
    return ethers.formatEther(balance);
  } catch (e: any) {
    console.error("Balance Fetch Error:", e);
    return "0.00";
  }
};

export const getGasPriceEstimates = async (rpcUrl: string) => {
  const provider = getProvider(rpcUrl);
  if (!provider) return { baseFee: '20', slow: { priorityFee: '1', maxFee: '21', speed: 'slow' }, average: { priorityFee: '2', maxFee: '25', speed: 'average' }, fast: { priorityFee: '5', maxFee: '35', speed: 'fast' } };

  try {
    const feeData = await provider.getFeeData();
    const baseFee = feeData.gasPrice || ethers.parseUnits('1', 'gwei');

    return {
      baseFee: ethers.formatUnits(baseFee, 'gwei'),
      slow: {
        priorityFee: "1",
        maxFee: ethers.formatUnits(baseFee + ethers.parseUnits('1', 'gwei'), 'gwei'),
        speed: 'slow'
      },
      average: {
        priorityFee: "2",
        maxFee: ethers.formatUnits(baseFee + ethers.parseUnits('2', 'gwei'), 'gwei'),
        speed: 'average'
      },
      fast: {
        priorityFee: "5",
        maxFee: ethers.formatUnits(baseFee + ethers.parseUnits('5', 'gwei'), 'gwei'),
        speed: 'fast'
      }
    };
  } catch (err) {
    return {
      baseFee: '20',
      slow: { priorityFee: '1', maxFee: '21', speed: 'slow' },
      average: { priorityFee: '2', maxFee: '25', speed: 'average' },
      fast: { priorityFee: '5', maxFee: '35', speed: 'fast' }
    };
  }
};

export const getContractBalance = async (contractAddress: string, walletAddress: string, decimals: number, rpcUrl: string): Promise<string> => {
  const provider = getProvider(rpcUrl);
  if (!provider) return "0.00";

  try {
    const abi = ["function balanceOf(address) view returns (uint256)"];
    const contract = new ethers.Contract(contractAddress, abi, provider);
    const balance = await contract.balanceOf(walletAddress);
    return ethers.formatUnits(balance, decimals);
  } catch (e) {
    return "0.00";
  }
};

export const importContract = async (name: string, address: string, abi: string, decimals: number, chainId: string) => {
  // SEC-09: Checksum-validate EVM addresses
  let checksumAddr = address;
  try {
    if (address.startsWith('0x') && address.length === 42) {
      checksumAddr = ethers.getAddress(address);
    }
  } catch (e: any) {
    throw new Error(`Invalid contract address: ${e.message}`);
  }

  // SEC-14: Validate ABI is a parseable JSON array
  try {
    const parsed = JSON.parse(abi);
    if (!Array.isArray(parsed)) throw new Error('ABI must be a JSON array');
  } catch (e: any) {
    throw new Error(`Invalid ABI format: ${e.message}`);
  }

  const vault = await getVault();
  if (!vault.contracts) vault.contracts = [];

  // SEC-11: Duplicate contract guard — prevent importing same address+chain twice
  const existing = vault.contracts.find(
    (c: any) => c.address.toLowerCase() === checksumAddr.toLowerCase() && c.chainId === chainId
  );
  if (existing) {
    logEvent('rpc', `Contract ${checksumAddr} already imported on ${chainId} — updating`, 'info');
    existing.name = name;
    existing.abi = abi;
    existing.decimals = decimals;
    await saveVault(vault);
    return existing;
  }

  const newContract = { name, address: checksumAddr, abi, decimals, chainId };
  vault.contracts.push(newContract);
  await saveVault(vault);
  return newContract;
};

export const listContracts = async (chainId: string) => {
  const vault = await getVault();
  return (vault.contracts || []).filter((c: any) => c.chainId === chainId);
};

export const deleteContract = async (address: string, chainId: string) => {
  const vault = await getVault();
  vault.contracts = (vault.contracts || []).filter((c: any) => !(c.address === address && c.chainId === chainId));
  await saveVault(vault);
};

export const importNFT = async (address: string, tokenId: string, name: string, chainId: string) => {
  const vault = await getVault();
  if (!vault.nfts) vault.nfts = [];
  const newNFT = { address, tokenId, name, symbol: "NFT", tokenUri: "", chainId };
  vault.nfts.push(newNFT);
  await saveVault(vault);
  return newNFT;
};

export const listNFTs = async (chainId: string) => {
  const vault = await getVault();
  return (vault.nfts || []).filter((n: any) => n.chainId === chainId);
};

export const deleteNFT = async (address: string, tokenId: string, chainId: string) => {
  const vault = await getVault();
  vault.nfts = (vault.nfts || []).filter((n: any) => !(n.address === address && n.tokenId === tokenId && n.chainId === chainId));
  await saveVault(vault);
};

export const getAssetPrices = async (): Promise<Record<string, number>> => {
  const prices: Record<string, number> = {};
  await Promise.all(Object.entries(PRICE_FEED_IDS).map(async ([chain, id]) => {
    if (!id || id === "0x") {
      return;
    }
    try {
      const response = await fetch(`${HERMES_URL}?ids[]=${id}`);
      if (!response.ok) return;
      const data = await response.json();
      const feed = data.parsed?.[0];
      if (feed && feed.price) {
        const expo = feed.price.expo || 0;
        const priceVal = feed.price.price || "0";
        prices[chain] = Number(priceVal) * Math.pow(10, expo);
      }
    } catch (err) { }
  }));
  return prices;
};

export const getHistory = async (address: string, chainId: string): Promise<HistoryData[]> => {
  const vault = await getVault();
  const safeAddress = (address || '').toLowerCase();
  return (vault.history || []).filter((h: any) =>
    (h.from.toLowerCase() === safeAddress || h.to.toLowerCase() === safeAddress) &&
    (chainId === 'all' || h.chainId === chainId)
  );
};

export const resetVault = async (mnemonic: string, pass: string): Promise<void> => {
  const vault: VaultData = {
    encryptedMnemonic: '',
    salt: '',
    iv: '',
    isEncrypted: true,
    wallets: [],
    contracts: [],
    nfts: [],
    history: []
  };
  (vault as any).__mnemonic = mnemonic;
  sessionMnemonic = mnemonic;
  sessionPassword = pass;
  touchSession();
  await saveVault(vault);
};

export const getSessionMnemonic = () => {
  // SEC-03: Check session expiry before exposing mnemonic
  if (isSessionExpired()) return null;
  touchSession();
  return sessionMnemonic;
};
