export interface ChainConfig {
  name: string;
  id: string;
  chainId: number;
  rpc: string;
  explorer: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  derivationPath: string;
  color: string;
  logo: string;
}

export const CHAINS: Record<string, ChainConfig> = {
  ethereum: {
    name: "Ethereum",
    id: "1",
    chainId: 1,
    rpc: "https://rpc.ankr.com/eth",
    explorer: "https://etherscan.io",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    derivationPath: "m/44'/60'/0'/0/0",
    color: "#627EEA",
    logo: "https://cryptologos.cc/logos/ethereum-eth-logo.png"
  },
  bsc: {
    name: "Binance Smart Chain",
    id: "56",
    chainId: 56,
    rpc: "https://rpc.ankr.com/bsc",
    explorer: "https://bscscan.com",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    derivationPath: "m/44'/60'/0'/0/0",
    color: "#F3BA2F",
    logo: "https://cryptologos.cc/logos/bnb-bnb-logo.png"
  },
  polygon: {
    name: "Polygon",
    id: "137",
    chainId: 137,
    rpc: "https://rpc.ankr.com/polygon",
    explorer: "https://polygonscan.com",
    nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
    derivationPath: "m/44'/60'/0'/0/0",
    color: "#8247E5",
    logo: "https://cryptologos.cc/logos/polygon-matic-logo.png"
  },
  pulsechain: {
    name: "PulseChain",
    id: "369",
    chainId: 369,
    rpc: "https://rpc.pulsechain.com",
    explorer: "https://otter.pulsechain.com",
    nativeCurrency: { name: "Pulse", symbol: "PLS", decimals: 18 },
    derivationPath: "m/44'/60'/0'/0/0",
    color: "#2ECC71",
    logo: "https://cryptologos.cc/logos/pulsechain-pls-logo.png"
  },
  quai: {
    name: "Quai Network",
    id: "969",
    chainId: 969,
    rpc: "https://quaiscan.io/api/eth-rpc",
    explorer: "https://quaiscan.io",
    nativeCurrency: { name: "Quai", symbol: "QUAI", decimals: 18 },
    derivationPath: "m/44'/969'/0'/0/0",
    color: "#E74C3C",
    logo: "https://quaiscan.io/images/quai-logo.svg"
  },
  monad: {
    name: "Monad",
    id: "143",
    chainId: 143,
    rpc: "https://rpc.ankr.com/monad",
    explorer: "https://monadvision.com",
    nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
    derivationPath: "m/44'/60'/0'/0/0",
    color: "#836EF9",
    logo: "https://pbs.twimg.com/profile_images/1701633519159930880/4747v35G_400x400.jpg"
  },
  bitcoin: {
    name: "Bitcoin",
    id: "bitcoin",
    chainId: 0,
    rpc: "https://rpc.ankr.com/btc",
    explorer: "https://blockchain.info",
    nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 8 },
    derivationPath: "m/84'/0'/0'/0/0",
    color: "#F7931A",
    logo: "https://cryptologos.cc/logos/bitcoin-btc-logo.png"
  },
  sui: {
    name: "Sui",
    id: "sui:mainnet",
    chainId: 0,
    rpc: "https://rpc.ankr.com/sui",
    explorer: "https://suiexplorer.com",
    nativeCurrency: { name: "Sui", symbol: "SUI", decimals: 9 },
    derivationPath: "m/44'/784'/0'/0'/0'",
    color: "#4DA2FF",
    logo: "https://cryptologos.cc/logos/sui-sui-logo.png"
  },
  tron: {
    name: "Tron",
    id: "728126428",
    chainId: 728126428,
    rpc: "https://api.trongrid.io/jsonrpc",
    explorer: "https://tronscan.org",
    nativeCurrency: { name: "Tron", symbol: "TRX", decimals: 6 },
    derivationPath: "m/44'/195'/0'/0/0",
    color: "#FF0013",
    logo: "https://cryptologos.cc/logos/tron-trx-logo.png"
  },
  xrpl_evm: {
    name: "XRPL EVM",
    id: "1440001",
    chainId: 1440001,
    rpc: "https://rpc-evm-sidechain.xrpl.org",
    explorer: "https://evm-sidechain.xrpl.org",
    nativeCurrency: { name: "XRP", symbol: "XRP", decimals: 18 },
    derivationPath: "m/44'/60'/0'/0/0",
    color: "#23292F",
    logo: "https://cryptologos.cc/logos/xrp-xrp-logo.png"
  },
  tron_evm: {
    name: "TRON EVM (BTTC)",
    id: "199",
    chainId: 199,
    rpc: "https://rpc.bittorrentchain.io",
    explorer: "https://bttcscan.com",
    nativeCurrency: { name: "BTT", symbol: "BTT", decimals: 18 },
    derivationPath: "m/44'/60'/0'/0/0",
    color: "#FF0013",
    logo: "https://cryptologos.cc/logos/bittorrent-btt-logo.png"
  },
  coredao: {
    name: "CORE",
    id: "1116",
    chainId: 1116,
    rpc: "https://rpc.coredao.org",
    explorer: "https://scan.coredao.org",
    nativeCurrency: { name: "CORE", symbol: "CORE", decimals: 18 },
    derivationPath: "m/44'/60'/0'/0/0",
    color: "#FF9500",
    logo: "https://scan.coredao.org/images/core-logo.svg"
  }
};

export const SELECTED_CHAINS = ['ethereum', 'polygon', 'bsc', 'tron', 'monad', 'xrpl_evm', 'bitcoin', 'sui'];
