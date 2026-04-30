export interface ChainConfig {
  name: string;
  id: string;
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
    rpc: "https://rpc.ankr.com/polygon",
    explorer: "https://polygonscan.com",
    nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
    derivationPath: "m/44'/60'/0'/0/0",
    color: "#8247E5",
    logo: "https://cryptologos.cc/logos/polygon-matic-logo.png"
  },
  monad: {
    name: "Monad",
    id: "143",
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
    rpc: "https://rpc.ankr.com/btc",
    explorer: "https://blockchain.info",
    nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 8 },
    derivationPath: "m/84'/0'/0'/0/0",
    color: "#F7931A",
    logo: "https://cryptologos.cc/logos/bitcoin-btc-logo.png"
  },
  tron: {
    name: "Tron",
    id: "728126428",
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
    rpc: "https://rpc-evm-sidechain.xrpl.org",
    explorer: "https://evm-sidechain.xrpl.org",
    nativeCurrency: { name: "XRP", symbol: "XRP", decimals: 18 },
    derivationPath: "m/44'/60'/0'/0/0",
    color: "#23292F",
    logo: "https://cryptologos.cc/logos/xrp-xrp-logo.png"
  }
};

export const SELECTED_CHAINS = ['ethereum', 'polygon', 'bsc', 'tron', 'monad', 'xrpl_evm'];
