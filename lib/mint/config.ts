/**
 * lib/mint/config.ts — where the Iced-Out XR Watches are minted. THE one file to edit.
 *
 * The watches are minted on Ethereum mainnet, and only there. Put the contract address here
 * once it is deployed (contracts/README.md), or set it at build time without touching code:
 *
 *   NEXT_PUBLIC_WATCH_CONTRACT=0x…                  # the deployed IcedOutXRWatches on mainnet
 *   NEXT_PUBLIC_WATCH_RPC=https://…                 # optional: your own mainnet RPC for reads
 *   NEXT_PUBLIC_WATCH_ART_BASE=https://arweave.net/<images manifest>/
 *                                                   # where the gallery thumbnails are served: the
 *                                                   # permaweb folder the private module's
 *                                                   # scripts/mint/upload-arweave.mjs prints
 *   NEXT_PUBLIC_WATCH_HOLDER_API=https://…          # the holder download server (private module's
 *                                                   # server/); unset hides the download buttons
 *
 * Development only (`next dev`, never a built app): the local Hardhat chain from contracts/
 * (`pnpm chain`, `pnpm local`) stands in for mainnet, so watches can be minted and worn without
 * spending real ETH:
 *
 *   NEXT_PUBLIC_WATCH_CHAIN_ID=31337
 *   NEXT_PUBLIC_WATCH_CONTRACT=0x5FbDB2315678afecb367f032d93F642f64180aa3   # what `pnpm local` prints
 *
 * Until a contract address is set, the mint modal shows the collection, the curve and the
 * try-on, says the mint is not open yet, and no Iced-Out watch can be worn in the wallet — there
 * is no override: to wear one while developing, mint it on the local chain.
 */

export interface MintChain {
    chainId: number;
    name: string;
    /** Public RPC used for reads (sale state, ownership). */
    rpc: string;
    explorer: string;
    testnet: boolean;
    currency: { name: string; symbol: string; decimals: 18 };
}

/** The only chain the watches are sold on. */
export const MAINNET: MintChain = {
    chainId: 1, name: 'Ethereum', rpc: 'https://ethereum-rpc.publicnode.com', explorer: 'https://etherscan.io',
    testnet: false, currency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
};

/** Hardhat's local node (contracts/: `pnpm chain`). Honoured by `next dev` only. */
export const LOCAL_CHAIN: MintChain = {
    chainId: 31337, name: 'Hardhat local', rpc: 'http://127.0.0.1:8545', explorer: '',
    testnet: true, currency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
};

// ── edit this line (or use NEXT_PUBLIC_WATCH_CONTRACT) once the contract is on mainnet ──
const CONTRACT_ADDRESS = '';        // the deployed IcedOutXRWatches, e.g. '0x1234…'

/** The mint chain: mainnet, except a dev server pointed at the local chain. */
export function mintChainFor(env: { nodeEnv?: string; chainId?: string }): MintChain {
    return env.nodeEnv === 'development' && Number(env.chainId) === LOCAL_CHAIN.chainId ? LOCAL_CHAIN : MAINNET;
}

const chain = mintChainFor({ nodeEnv: process.env.NODE_ENV, chainId: process.env.NEXT_PUBLIC_WATCH_CHAIN_ID });
const local = chain.chainId === LOCAL_CHAIN.chainId;
// a local deployment's address never falls back to the mainnet one in this file
const contract = ((local ? process.env.NEXT_PUBLIC_WATCH_CONTRACT : process.env.NEXT_PUBLIC_WATCH_CONTRACT || CONTRACT_ADDRESS) ?? '').trim();

/** An https permaweb folder (gateway URL), always ending in '/'; '' when unset or not https. */
export function artBaseFrom(value: string | undefined): string {
    const v = (value ?? '').trim();
    if (!/^https:\/\/[^\s/]+\/\S*$/.test(v)) return '';
    return v.endsWith('/') ? v : `${v}/`;
}

export const MINT_CONFIG = {
    chain: { ...chain, rpc: (!local && process.env.NEXT_PUBLIC_WATCH_RPC) || chain.rpc },
    /** '' until deployed. */
    contract: /^0x[0-9a-fA-F]{40}$/.test(contract) ? contract : '',
    /**
     * The mint art on Arweave, through a gateway (the images manifest's folder), e.g.
     * 'https://arweave.net/<id>/'. '' = serve the thumbnails from public/watches/ (local only).
     */
    artBase: artBaseFrom(process.env.NEXT_PUBLIC_WATCH_ART_BASE),
    /**
     * How many other people's mints the default "price protection" absorbs: the wallet is asked
     * to authorise the price as if that many mints landed first; whatever is not needed comes
     * straight back in the same transaction (the contract refunds the excess).
     */
    protectMints: 2,
    /** How often ownership is read again while the app runs. */
    ownershipTtlMs: 5 * 60_000,
} as const;

export const mintDeployed = () => MINT_CONFIG.contract !== '';

/** Etherscan link for an address; '' on the local chain (no explorer). */
export function explorerAddress(address: string): string {
    return MINT_CONFIG.chain.explorer ? `${MINT_CONFIG.chain.explorer}/address/${address}` : '';
}

/** Etherscan link for a transaction; '' on the local chain. */
export function explorerTx(hash: string): string {
    return MINT_CONFIG.chain.explorer ? `${MINT_CONFIG.chain.explorer}/tx/${hash}` : '';
}
