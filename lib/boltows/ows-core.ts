import { ethers, wordlists } from 'ethers';
import { LangEn } from 'ethers/wordlists';
import { CHAINS as CORE_CHAINS } from "./chains";

// BOLT-09: Robust wordlist resolution to prevent "FAILED" errors in minified builds
// We explicitly register the English wordlist into the global ethers wordlists.
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
      providerCache[rpcUrl] = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
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

export class BoltwalletCore {
  private chainId: string = 'ethereum';

  async getWallets() { return listWallets(this.chainId); }
  async listWallets() { return listWallets(this.chainId); } // Consistency for multi-UI support
  async createNewWallet(name: string) { return createWallet(name, this.chainId); }
  async isVaultLocked() { return isVaultLocked(); }
  async unlockVault(password: string) { return unlockVault(password); }
  async isVaultSetup() { return isVaultSetup(); }
  async setupVault(password: string) { return setupVault(password); }
  async getNativeBalance(address: string) {
    const rpc = CHAINS[this.chainId as keyof typeof CHAINS]?.rpc || '';
    return getNativeBalance(address, rpc);
  }
  async getContractBalance(contractAddress: string, walletAddress: string, decimals: number) {
    const rpc = CHAINS[this.chainId as keyof typeof CHAINS]?.rpc || '';
    return getContractBalance(contractAddress, walletAddress, decimals, rpc);
  }
  async getGasPriceEstimates() {
    const rpc = CHAINS[this.chainId as keyof typeof CHAINS]?.rpc || '';
    return getGasPriceEstimates(rpc);
  }
  async listContracts() { return listContracts(this.chainId); }
  async importContract(name: string, address: string, abi: string, decimals: number) {
    return importContract(name, address, abi, decimals, this.chainId);
  }
  async deleteContract(address: string) {
    return deleteContract(address, this.chainId);
  }
  async listNFTs() { return listNFTs(this.chainId); }
  async importNFT(address: string, tokenId: string, name: string) {
    return importNFT(address, tokenId, name, this.chainId);
  }
  async deleteNFT(address: string, tokenId: string) {
    return deleteNFT(address, tokenId, this.chainId);
  }
  async getAssetPrices() { return getAssetPrices(); }
  async getHistory(address: string) { return getHistory(address, this.chainId); }
  async signTransaction(walletId: string, tx: any) { return signTransaction(walletId, this.chainId, JSON.stringify(tx)); }
  async resetVault(mnemonic: string, pass: string) { return resetVault(mnemonic, pass); }
  async getSession() { return getSessionMnemonic(); }

  onLogs(cb: any) { return onLogs(cb); }
  getLogs() { return getLogs(); }

  setActiveChain(chainId: string) {
    this.chainId = chainId;
  }

  async getSwapQuote(fromAsset: string, toAsset: string, amount: string): Promise<any> {
    // Mocking a swap quote logic
    const mockRate = fromAsset === 'MON' ? 0.024 : 41.66;
    const fromAmount = parseFloat(amount) || 0;
    const toAmount = fromAmount * mockRate;
    const fee = 0.001;

    return {
      fromAsset,
      toAsset,
      fromAmount,
      toAmount: toAmount.toFixed(4),
      rate: mockRate,
      fee,
      estimatedGas: "0.0001"
    };
  }

  async executeSwap(walletName: string, swapData: any): Promise<string> {
    const tx = {
      to: "0x1111111254fb6c44bac0bed2854e76f90643097d", // Mock Router
      value: swapData.fromAsset === 'native' ? swapData.fromAmount : "0",
      data: "0x12345678" // Mock data
    };
    const result = await signTransaction(walletName, this.chainId, JSON.stringify(tx));
    return result.signature;
  }
}

// Crypto Helpers
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
      iterations: 100000,
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

const getVault = async (): Promise<VaultData> => {
  if (typeof window === 'undefined') return initializeVault();
  const data = localStorage.getItem(VAULT_KEY);
  if (data) {
    return JSON.parse(data);
  }
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
  saveVault(newData);
  return newData;
};

export const setupVault = async (password: string): Promise<string> => {
  const wallet = ethers.Wallet.createRandom();
  const mnemonic = wallet.mnemonic?.phrase || '';
  const encrypted = await encryptData(mnemonic, password);

  const vault = await getVault();
  vault.encryptedMnemonic = encrypted.encrypted;
  vault.salt = encrypted.salt;
  vault.iv = encrypted.iv;
  vault.isEncrypted = true;

  await saveVault(vault);
  sessionMnemonic = mnemonic;
  return mnemonic;
};

export const unlockVault = async (password: string): Promise<boolean> => {
  const vault = await getVault();
  if (!vault.isEncrypted) return false;
  try {
    sessionMnemonic = await decryptData(vault.encryptedMnemonic, vault.salt, vault.iv, password);
    return true;
  } catch (e) {
    return false;
  }
};

export const isVaultLocked = () => !sessionMnemonic;
export const isVaultSetup = async () => {
  const vault = await getVault();
  return vault.isEncrypted;
};

const saveVault = async (data: VaultData) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(VAULT_KEY, JSON.stringify(data));
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
    const wordlist = (wordlists as any).en || LangEn.wordlist();
    const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, fullPath, wordlist);
    return wallet.address;
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
  if (!sessionMnemonic) throw new Error("Vault is locked");
  logEvent('security', `Signing transaction for ${chainId}...`, 'info');
  
  const vault = await getVault();
  const w = vault.wallets.find((x: any) => x.id === walletId || x.name === walletId);
  if (!w) throw new Error("Wallet not found");

  try {
    const txParams = JSON.parse(txHex);
    validateTransactionPayload(txParams);

    const basePath = DERIVATION_PATHS[chainId] || "m/44'/60'/0'/0/";
    const fullPath = basePath.endsWith('/') ? `${basePath}${w.index}` : `${basePath}/${w.index}`;
    
    const wordlist = (wordlists as any).en || LangEn.wordlist();
    const hdNode = ethers.HDNodeWallet.fromPhrase(sessionMnemonic, undefined, fullPath, wordlist);
    const wallet = new ethers.Wallet(hdNode.privateKey);

    const chainConfig = CHAINS[chainId as keyof typeof CHAINS];
    
    // Perform actual signing
    const signature = await wallet.signTransaction({
      to: txParams.to,
      value: txParams.value ? ethers.parseEther(txParams.value.toString()) : 0n,
      data: txParams.data || '0x',
      nonce: txParams.nonce || 0,
      gasLimit: txParams.gasLimit || 21000n,
      gasPrice: txParams.gasPrice || ethers.parseUnits('1', 'gwei'),
      chainId: Number(chainConfig?.id || 1)
    });

    const from = hdNode.address;
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

export const getNativeBalance = async (address: string, rpcUrl: string): Promise<string> => {
  if (!address || typeof address !== 'string') return "0.00";
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
  const vault = await getVault();
  if (!vault.contracts) vault.contracts = [];
  const newContract = { name, address, abi, decimals, chainId };
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
      if (chain === 'monad') prices[chain] = 4.20;
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
  const encrypted = await encryptData(mnemonic, pass);
  const vault = await getVault();
  vault.encryptedMnemonic = encrypted.encrypted;
  vault.salt = encrypted.salt;
  vault.iv = encrypted.iv;
  vault.isEncrypted = true;
  vault.wallets = [];
  vault.history = [];
  await saveVault(vault);
  sessionMnemonic = mnemonic;
};

export const getSessionMnemonic = () => sessionMnemonic;
