/** lib/mint/abi.ts — the parts of IcedOutXRWatches the wallet and the mint modal call. */

export const WATCH_ABI = [
    'function mint(uint256 quantity) payable',
    'function quote(uint256 quantity) view returns (uint256)',
    'function nextPrice() view returns (uint256)',
    'function priceAt(uint256 n) pure returns (uint256)',
    'function totalMinted() view returns (uint256)',
    'function MAX_SUPPLY() view returns (uint256)',
    'function phase() view returns (uint8)',
    'function passToken() view returns (address)',
    'function holdsPass(address account) view returns (bool)',
    'function mintInfo(address account) view returns (uint8 phase, uint256 minted, uint256 price, uint256 walletMinted, uint256 walletLimit, bool pass)',
    'function tokensOfOwner(address account) view returns (uint256[])',
    'function balanceOf(address owner) view returns (uint256)',
    'function ownerOf(uint256 tokenId) view returns (address)',
    'event Minted(address indexed to, uint256 indexed firstId, uint256 quantity, uint256 paid)',
    'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
    'error MintClosed()',
    'error NotOnAllowlist(address account)',
    'error ZeroQuantity()',
    'error SoldOut(uint256 remaining)',
    'error WalletLimit(uint256 remainingForWallet)',
    'error InsufficientPayment(uint256 required, uint256 sent)',
    'error RefundFailed()',
    'error ReentrancyGuardReentrantCall()',
    'error ERC721InvalidReceiver(address receiver)',
] as const;

/** `phase()` values. */
export const PHASES = ['closed', 'allowlist', 'public'] as const;
export type SalePhase = (typeof PHASES)[number];
