/**
 * How a chain is addressed, signed and broadcast.
 * - evm:     secp256k1 / Ethereum-style accounts, JSON-RPC broadcast
 * - bitcoin: BIP84 native SegWit, Esplora REST
 * - sui:     Ed25519, Sui JSON-RPC
 * - tron:    secp256k1 keys with Base58Check addresses (read-only in Bolt XR)
 * - quai:    sharded address space (not yet supported)
 */
export type ChainKind = 'evm' | 'bitcoin' | 'sui' | 'tron' | 'quai';

export interface ChainConfig {
  name: string;
  id: string;
  chainId: number;
  kind: ChainKind;
  rpc: string;
  /** Tried in order when `rpc` is unreachable. */
  rpcFallbacks?: string[];
  explorer: string;
  /** Path appended with the tx hash to build an explorer link. */
  explorerTxPath: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  derivationPath: string;
  color: string;
  logo: string;
  /** Whether Bolt XR can sign and broadcast native transfers on this chain. */
  canSend: boolean;
  /** Whether the chain is routable through the LI.FI aggregator. */
  canSwap: boolean;
}

export const CHAINS: Record<string, ChainConfig> = {
  ethereum: {
    name: "Ethereum",
    id: "1",
    chainId: 1,
    kind: 'evm',
    rpc: "https://rpc.ankr.com/eth",
    rpcFallbacks: ["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com"],
    explorer: "https://etherscan.io",
    explorerTxPath: "/tx/",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    derivationPath: "m/44'/60'/0'/0/0",
    color: "#627EEA",
    logo: "https://cryptologos.cc/logos/ethereum-eth-logo.png",
    canSend: true,
    canSwap: true,
  },
  bsc: {
    name: "BNB Smart Chain",
    id: "56",
    chainId: 56,
    kind: 'evm',
    rpc: "https://rpc.ankr.com/bsc",
    rpcFallbacks: ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.bnbchain.org"],
    explorer: "https://bscscan.com",
    explorerTxPath: "/tx/",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    derivationPath: "m/44'/60'/0'/0/0",
    color: "#F3BA2F",
    logo: "https://cryptologos.cc/logos/bnb-bnb-logo.png",
    canSend: true,
    canSwap: true,
  },
  polygon: {
    name: "Polygon",
    id: "137",
    chainId: 137,
    kind: 'evm',
    rpc: "https://rpc.ankr.com/polygon",
    rpcFallbacks: ["https://polygon-bor-rpc.publicnode.com", "https://polygon-rpc.com"],
    explorer: "https://polygonscan.com",
    explorerTxPath: "/tx/",
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    derivationPath: "m/44'/60'/0'/0/0",
    color: "#8247E5",
    logo: "https://cryptologos.cc/logos/polygon-matic-logo.png",
    canSend: true,
    canSwap: true,
  },
  pulsechain: {
    name: "PulseChain",
    id: "369",
    chainId: 369,
    kind: 'evm',
    rpc: "https://rpc.pulsechain.com",
    rpcFallbacks: ["https://pulsechain-rpc.publicnode.com"],
    explorer: "https://otter.pulsechain.com",
    explorerTxPath: "/tx/",
    nativeCurrency: { name: "Pulse", symbol: "PLS", decimals: 18 },
    derivationPath: "m/44'/60'/0'/0/0",
    color: "#2ECC71",
    logo: "https://cryptologos.cc/logos/pulsechain-pls-logo.png",
    canSend: true,
    canSwap: false,
  },
  quai: {
    name: "Quai Network",
    id: "969",
    chainId: 969,
    kind: 'quai',
    rpc: "https://quaiscan.io/api/eth-rpc",
    explorer: "https://quaiscan.io",
    explorerTxPath: "/tx/",
    nativeCurrency: { name: "Quai", symbol: "QUAI", decimals: 18 },
    derivationPath: "m/44'/969'/0'/0/0",
    color: "#E74C3C",
    logo: "https://quaiscan.io/images/quai-logo.svg",
    canSend: false,
    canSwap: false,
  },
  monad: {
    name: "Monad",
    id: "143",
    chainId: 143,
    kind: 'evm',
    rpc: "https://rpc.ankr.com/monad",
    rpcFallbacks: ["https://rpc.monad.xyz"],
    explorer: "https://monadvision.com",
    explorerTxPath: "/tx/",
    nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
    derivationPath: "m/44'/60'/0'/0/0",
    color: "#836EF9",
    logo: "https://pbs.twimg.com/profile_images/1701633519159930880/4747v35G_400x400.jpg",
    canSend: true,
    canSwap: false,
  },
  bitcoin: {
    name: "Bitcoin",
    id: "bitcoin",
    chainId: 0,
    kind: 'bitcoin',
    // Esplora-compatible REST APIs
    rpc: "https://blockstream.info/api",
    rpcFallbacks: ["https://mempool.space/api"],
    explorer: "https://mempool.space",
    explorerTxPath: "/tx/",
    nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 8 },
    derivationPath: "m/84'/0'/0'/0/0",
    color: "#F7931A",
    logo: "https://cryptologos.cc/logos/bitcoin-btc-logo.png",
    canSend: false,
    canSwap: false,
  },
  sui: {
    name: "Sui",
    id: "sui:mainnet",
    chainId: 0,
    kind: 'sui',
    rpc: "https://fullnode.mainnet.sui.io:443",
    rpcFallbacks: ["https://rpc.ankr.com/sui"],
    explorer: "https://suiscan.xyz/mainnet",
    explorerTxPath: "/tx/",
    nativeCurrency: { name: "Sui", symbol: "SUI", decimals: 9 },
    derivationPath: "m/44'/784'/0'/0'/0'",
    color: "#4DA2FF",
    logo: "https://cryptologos.cc/logos/sui-sui-logo.png",
    canSend: true,
    canSwap: false,
  },
  tron: {
    name: "Tron",
    id: "728126428",
    chainId: 728126428,
    kind: 'tron',
    rpc: "https://api.trongrid.io/jsonrpc",
    explorer: "https://tronscan.org",
    explorerTxPath: "/#/transaction/",
    nativeCurrency: { name: "Tron", symbol: "TRX", decimals: 6 },
    derivationPath: "m/44'/195'/0'/0/0",
    color: "#FF0013",
    logo: "https://cryptologos.cc/logos/tron-trx-logo.png",
    canSend: false,
    canSwap: false,
  },
  xrpl_evm: {
    name: "XRPL EVM",
    id: "1440001",
    chainId: 1440001,
    kind: 'evm',
    rpc: "https://rpc-evm-sidechain.xrpl.org",
    explorer: "https://evm-sidechain.xrpl.org",
    explorerTxPath: "/tx/",
    nativeCurrency: { name: "XRP", symbol: "XRP", decimals: 18 },
    derivationPath: "m/44'/60'/0'/0/0",
    color: "#23292F",
    logo: "https://cryptologos.cc/logos/xrp-xrp-logo.png",
    canSend: true,
    canSwap: false,
  },
  tron_evm: {
    name: "TRON EVM (BTTC)",
    id: "199",
    chainId: 199,
    kind: 'evm',
    rpc: "https://rpc.bittorrentchain.io",
    explorer: "https://bttcscan.com",
    explorerTxPath: "/tx/",
    nativeCurrency: { name: "BTT", symbol: "BTT", decimals: 18 },
    derivationPath: "m/44'/60'/0'/0/0",
    color: "#FF0013",
    logo: "https://cryptologos.cc/logos/bittorrent-btt-logo.png",
    canSend: true,
    canSwap: false,
  },
  coredao: {
    name: "CORE",
    id: "1116",
    chainId: 1116,
    kind: 'evm',
    rpc: "https://rpc.coredao.org",
    explorer: "https://scan.coredao.org",
    explorerTxPath: "/tx/",
    nativeCurrency: { name: "CORE", symbol: "CORE", decimals: 18 },
    derivationPath: "m/44'/60'/0'/0/0",
    color: "#FF9500",
    logo: "https://scan.coredao.org/images/core-logo.svg",
    canSend: true,
    canSwap: false,
  }
};

/** Chains shown in the wallet UI (both 2D and XR stacks). */
export const SELECTED_CHAINS = ['ethereum', 'polygon', 'bsc', 'monad', 'bitcoin', 'sui', 'tron'];

export const getChain = (chainKey: string): ChainConfig | undefined => CHAINS[chainKey];

/** All RPC endpoints for a chain, primary first. */
export const getRpcUrls = (chainKey: string): string[] => {
  const chain = CHAINS[chainKey];
  if (!chain) return [];
  return [chain.rpc, ...(chain.rpcFallbacks || [])].filter(Boolean);
};

/** Resolve a chain key from either a key ("ethereum") or a chain id ("1", "sui:mainnet"). */
export const resolveChainKey = (keyOrId: string | number | undefined | null): string | null => {
  if (keyOrId === undefined || keyOrId === null || keyOrId === '') return null;
  const value = String(keyOrId);
  if (CHAINS[value]) return value;
  const match = Object.keys(CHAINS).find(
    key => CHAINS[key].id === value || (CHAINS[key].chainId !== 0 && String(CHAINS[key].chainId) === value)
  );
  return match || null;
};

export const getExplorerTxUrl = (chainKey: string, hash: string): string | null => {
  const chain = CHAINS[chainKey];
  if (!chain || !hash) return null;
  return `${chain.explorer}${chain.explorerTxPath}${hash}`;
};
