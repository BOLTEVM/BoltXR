/**
 * lib/mint/client.ts — reading the sale and minting, against the contract in ./config.ts.
 *
 * Reads go through the chain's public RPC (no wallet needed). Writes go through either a
 * browser wallet (EIP-1193 — MetaMask, Rabby, Coinbase Wallet…) or the Bolt vault itself
 * when the mint chain is one the vault signs for.
 */

import {
    BrowserProvider, Contract, JsonRpcProvider, Network, ZeroAddress, formatEther, getAddress, isCallException, isError,
    type ContractRunner, type Eip1193Provider, type TransactionReceipt,
} from 'ethers';
import { WATCH_ABI, PHASES, type SalePhase } from './abi';
import { MINT_CONFIG, mintDeployed } from './config';
import { SUPPLY, priceWei, quoteWei } from './priceTable';

let reader: JsonRpcProvider | null = null;

/** Read-only provider for the mint chain. */
export function readProvider(): JsonRpcProvider {
    if (!reader) {
        const c = MINT_CONFIG.chain;
        reader = new JsonRpcProvider(c.rpc, c.chainId, { staticNetwork: Network.from(c.chainId) });
    }
    return reader;
}

export function watchContract(runner: ContractRunner = readProvider()): Contract {
    if (!mintDeployed()) throw new Error('The watch contract is not deployed yet');
    return new Contract(MINT_CONFIG.contract, WATCH_ABI, runner);
}

export interface SaleState {
    /** false until lib/mint/config.ts has a contract address. */
    deployed: boolean;
    phase: SalePhase;
    minted: number;
    supply: number;
    /** Price of the next mint in wei; null once sold out. */
    nextPriceWei: bigint | null;
    /** Tokens the account has minted (0 without an account). */
    walletMinted: number;
    /** Per-address cap, 0 = none. */
    walletLimit: number;
    /** Whether the account holds an allowlist pass; null without an account. */
    holdsPass: boolean | null;
    passToken: string | null;
    updatedAt: number;
}

/** Sale state from the curve alone (before deployment, or while the chain is unreachable). */
export function tableSale(minted = 0): SaleState {
    return {
        deployed: mintDeployed(), phase: 'closed', minted, supply: SUPPLY,
        nextPriceWei: minted < SUPPLY ? priceWei(minted + 1) : null,
        walletMinted: 0, walletLimit: 0, holdsPass: null, passToken: null, updatedAt: Date.now(),
    };
}

/** The live sale, as `account` sees it. */
export async function fetchSale(account?: string | null): Promise<SaleState> {
    if (!mintDeployed()) return tableSale();
    const c = watchContract();
    const who = account ? getAddress(account) : ZeroAddress;
    const [info, pass] = await Promise.all([
        c.getFunction('mintInfo').staticCall(who) as Promise<[bigint, bigint, bigint, bigint, bigint, boolean]>,
        c.getFunction('passToken').staticCall() as Promise<string>,
    ]);
    const [phase, minted, price, walletMinted, walletLimit, holds] = info;
    return {
        deployed: true,
        phase: PHASES[Number(phase)] ?? 'closed',
        minted: Number(minted),
        supply: SUPPLY,
        nextPriceWei: price === 0n ? null : price,
        walletMinted: Number(walletMinted),
        walletLimit: Number(walletLimit),
        holdsPass: account ? holds : null,
        passToken: pass === ZeroAddress ? null : pass,
        updatedAt: Date.now(),
    };
}

export interface MintPlan {
    /** Token ids this mint will receive if nobody mints first. */
    ids: number[];
    /** What it costs right now. */
    costWei: bigint;
    /** What the wallet is asked to authorise (covers `protect` mints landing first). */
    valueWei: bigint;
    /** Most that comes back if nobody mints first. */
    refundWei: bigint;
}

/**
 * Price `quantity` mints after `minted` sold, authorising enough for `protect` other mints
 * landing first. The contract charges the price at execution and refunds the rest, and a
 * stale price simply reverts (InsufficientPayment) — so the cost can never exceed `valueWei`.
 */
export function planMint(minted: number, quantity: number, protect: number = MINT_CONFIG.protectMints): MintPlan {
    const first = minted + 1;
    if (quantity < 1 || first + quantity - 1 > SUPPLY) throw new RangeError('Not that many left');
    const costWei = quoteWei(first, quantity);
    const shiftedFirst = Math.min(first + Math.max(0, protect), SUPPLY - quantity + 1);
    const valueWei = quoteWei(shiftedFirst, quantity);
    return { ids: Array.from({ length: quantity }, (_, i) => first + i), costWei, valueWei, refundWei: valueWei - costWei };
}

export interface MintResult {
    hash: string;
    tokenIds: number[];
    paidWei: bigint | null;
}

function mintedFrom(receipt: TransactionReceipt | null, account: string): { tokenIds: number[]; paidWei: bigint | null } {
    if (!receipt) return { tokenIds: [], paidWei: null };
    const iface = watchContract().interface;
    const ids: number[] = [];
    let paid: bigint | null = null;
    const me = account.toLowerCase();
    for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== MINT_CONFIG.contract.toLowerCase()) continue;
        const parsed = (() => { try { return iface.parseLog({ topics: [...log.topics], data: log.data }); } catch { return null; } })();
        if (!parsed) continue;
        if (parsed.name === 'Transfer' && String(parsed.args[0]) === ZeroAddress && String(parsed.args[1]).toLowerCase() === me) ids.push(Number(parsed.args[2]));
        if (parsed.name === 'Minted') paid = parsed.args[3] as bigint;
    }
    return { tokenIds: ids.sort((a, b) => a - b), paidWei: paid };
}

/** Dry-run the mint as `from` so a revert reads as a sentence before any wallet prompt. */
export async function preflightMint(from: string, quantity: number, valueWei: bigint): Promise<void> {
    await watchContract().getFunction('mint').staticCall(quantity, { value: valueWei, from: getAddress(from) });
}

/** Mint through a browser wallet already connected to the mint chain. */
export async function mintWithBrowserWallet(
    ethereum: Eip1193Provider, account: string, quantity: number, valueWei: bigint,
    onSubmitted?: (hash: string) => void,
): Promise<MintResult> {
    await preflightMint(account, quantity, valueWei);
    const browser = new BrowserProvider(ethereum);
    const signer = await browser.getSigner(account);
    const tx = await watchContract(signer).getFunction('mint')(quantity, { value: valueWei });
    onSubmitted?.(tx.hash);
    const receipt = await readProvider().waitForTransaction(tx.hash, 1, 10 * 60_000);
    if (!receipt || receipt.status !== 1) throw new Error('The mint transaction failed on chain.');
    return { hash: tx.hash, ...mintedFrom(receipt, account) };
}

/** Mint by having the Bolt vault sign (only when it signs for the mint chain). */
export async function mintWithVault(
    send: (to: string, data: string, valueWei: bigint) => Promise<string>,
    account: string, quantity: number, valueWei: bigint,
    onSubmitted?: (hash: string) => void,
): Promise<MintResult> {
    await preflightMint(account, quantity, valueWei);
    const data = watchContract().interface.encodeFunctionData('mint', [quantity]);
    const hash = await send(MINT_CONFIG.contract, data, valueWei);
    onSubmitted?.(hash);
    const receipt = await readProvider().waitForTransaction(hash, 1, 10 * 60_000);
    if (!receipt || receipt.status !== 1) throw new Error('The mint transaction failed on chain.');
    return { hash, ...mintedFrom(receipt, account) };
}

const eth = (wei: bigint) => `${Number(formatEther(wei)).toLocaleString(undefined, { maximumSignificantDigits: 4 })} ETH`;

/** One sentence for anything a mint can throw. */
export function describeMintError(e: unknown): string {
    if (isError(e, 'ACTION_REJECTED') || (e as { code?: number })?.code === 4001) return 'You cancelled the request in your wallet.';
    if (isError(e, 'INSUFFICIENT_FUNDS')) return 'Not enough ETH in this wallet for the price plus network fee.';
    if (isCallException(e) && e.revert) {
        const a = e.revert.args;
        switch (e.revert.name) {
            case 'MintClosed': return 'The mint is not open yet.';
            case 'NotOnAllowlist': return 'This address does not hold an allowlist pass. The allowlist phase is for pass holders only.';
            case 'ZeroQuantity': return 'Choose at least one watch.';
            case 'SoldOut': return Number(a[0]) === 0 ? 'All 150 watches have been minted.' : `Only ${a[0]} left — lower the quantity.`;
            case 'WalletLimit': return Number(a[0]) === 0 ? 'This address has minted as many as one address may.' : `This address can mint ${a[0]} more.`;
            case 'InsufficientPayment': return `Others minted first — this now costs ${eth(a[0] as bigint)}. Review the new price and try again.`;
            case 'RefundFailed': return 'This wallet cannot receive the refund of the unused price protection. Turn price protection off and try again.';
            case 'ERC721InvalidReceiver': return 'This address is a contract that cannot hold NFTs.';
        }
    }
    const err = e as { shortMessage?: string; message?: string };
    return err?.shortMessage || err?.message || 'Something went wrong.';
}

export { eth as formatEth };
