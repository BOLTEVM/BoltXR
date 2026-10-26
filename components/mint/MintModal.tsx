'use client';

/**
 * MintModal — mint the Iced-Out XR Watches from the landing page.
 *
 * Browse all 150, try any of them on (studio, display arm, or your own wrist through the
 * camera), and mint the next ones in line on the rising price curve. Everything here is a
 * preview: the watch's wallet and DeFi desk only work in Bolt XR for a holder.
 */

import { useCallback, useMemo, useState } from 'react';
import { BadgeCheck, ExternalLink, Gem, Link2, Loader2, Minus, Plus, ShieldCheck, Wallet } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import { useWallet } from '@/hooks/useWallet';
import { useWatchOwnership } from '@/hooks/useWatchOwnership';
import { useBrowserWallet, useMintSale } from '@/hooks/useMintSale';
import { walletCore } from '@/lib/boltows/core-instance';
import { CHAINS } from '@/lib/boltows/chains';
import { MINT_CONFIG, explorerAddress, explorerTx } from '@/lib/mint/config';
import { describeMintError, formatEth, mintWithBrowserWallet, mintWithVault, planMint } from '@/lib/mint/client';
import { holderMessage } from '@/lib/mint/ownership';
import { SUPPLY, SELL_OUT_ETH } from '@/lib/mint/priceTable';
import { signWithWallet } from '@/lib/mint/wallets';
import type { StageMode } from '@/lib/iced-out/contract';
import { editionInfo, editionMetadata } from '@/lib/mint/editions';
import EditionStrip from './EditionStrip';
import PriceTrack from './PriceTrack';
import WatchTryOn from './WatchTryOn';
import { rarityColor } from './rarity';

interface MintModalProps {
    open: boolean;
    onClose: () => void;
    /** Edition to open on (default: the next one to mint). */
    initialEdition?: number;
}

type MintStep =
    | { kind: 'idle' }
    | { kind: 'confirm' }
    | { kind: 'pending'; hash: string }
    | { kind: 'done'; hash: string; ids: number[]; via: 'browser' | 'vault' }
    | { kind: 'error'; message: string };

const SHOWN_TRAITS = ['Network Endpoint', 'Case Material', 'Diamond Setting Style', 'Gemstone Accent', 'Centerpiece Branding'];
const TRAIT_LABEL: Record<string, string> = {
    'Network Endpoint': 'Network',
    'Case Material': 'Case',
    'Diamond Setting Style': 'Setting',
    'Gemstone Accent': 'Accent',
    'Centerpiece Branding': 'Centrepiece',
};

/** The vault signs EVM transactions for chains in its own list. */
const VAULT_CHAIN_KEY = Object.keys(CHAINS).find(k => CHAINS[k].kind === 'evm' && CHAINS[k].chainId === MINT_CONFIG.chain.chainId) ?? null;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const pad = (n: number) => String(n).padStart(3, '0');
const idRange = (ids: number[]) => (ids.length === 1 ? `#${pad(ids[0])}` : `#${pad(ids[0])}–#${pad(ids[ids.length - 1])}`);

export default function MintModal({ open, onClose, initialEdition }: MintModalProps) {
    const vault = useWallet();
    const ownership = useWatchOwnership();
    const browser = useBrowserWallet();
    const [payWith, setPayWith] = useState<'browser' | 'vault'>('browser');
    const vaultReady = !!VAULT_CHAIN_KEY && vault.status === 'unlocked' && !!vault.addresses.ethereum && !!vault.walletId;
    const via: 'browser' | 'vault' = payWith === 'vault' && vaultReady ? 'vault' : 'browser';
    const account = via === 'vault' ? vault.addresses.ethereum : browser.account;

    const { sale, error: saleError, refresh } = useMintSale(account, open);
    const next = sale.minted < SUPPLY ? sale.minted + 1 : null;

    const [picked, setPicked] = useState<number | null>(initialEdition ?? null);
    const selected = picked ?? next ?? SUPPLY;
    const [mode, setMode] = useState<StageMode>('studio');
    const [quantity, setQuantity] = useState(1);
    const [protect, setProtect] = useState(true);
    const [step, setStep] = useState<MintStep>({ kind: 'idle' });
    const [celebrate, setCelebrate] = useState(0);
    const [linkState, setLinkState] = useState<'idle' | 'signing' | 'linked' | 'error'>('idle');

    const spec = editionInfo(selected);
    const meta = useMemo(() => editionMetadata(selected), [selected]);
    const remaining = SUPPLY - sale.minted;
    const walletLeft = sale.walletLimit > 0 ? Math.max(0, sale.walletLimit - sale.walletMinted) : Infinity;
    const maxQty = Math.max(1, Math.min(remaining, walletLeft, 10));
    const qty = Math.min(quantity, maxQty);
    const plan = useMemo(() => (remaining > 0 ? planMint(sale.minted, qty, protect ? MINT_CONFIG.protectMints : 0) : null), [sale.minted, qty, protect, remaining]);

    const wrongChain = via === 'browser' && !!browser.account && browser.chainId !== null && browser.chainId !== MINT_CONFIG.chain.chainId;
    const busy = step.kind === 'confirm' || step.kind === 'pending';

    // Why minting is not possible right now (null = it is).
    const blocker = !sale.deployed ? 'The mint opens soon — the contract address will be published here.'
        : remaining === 0 ? 'All 150 watches have been minted.'
            : sale.phase === 'closed' ? 'The mint is not open yet.'
                : !account ? null
                    : sale.phase === 'allowlist' && sale.holdsPass === false ? 'The allowlist phase is for pass holders, and this address holds no pass. The public mint opens after it.'
                        : walletLeft === 0 ? 'This address has minted as many as one address may.'
                            : null;

    const pick = useCallback((id: number) => setPicked(id), []);

    const mint = async () => {
        if (!plan || !account || blocker) return;
        setStep({ kind: 'confirm' });
        try {
            const onSubmitted = (hash: string) => setStep({ kind: 'pending', hash });
            const result = via === 'vault'
                ? await mintWithVault(
                    (to, data, valueWei) => walletCore.sendTransaction(vault.walletId!, VAULT_CHAIN_KEY!, { to, data, value: valueWei }),
                    account, qty, plan.valueWei, onSubmitted)
                : await mintWithBrowserWallet(browser.wallet!.provider, account, qty, plan.valueWei, onSubmitted);
            const ids = result.tokenIds.length ? result.tokenIds : plan.ids;
            setStep({ kind: 'done', hash: result.hash, ids, via });
            setPicked(ids[0]);
            setCelebrate(c => c + 1);
            refresh();
            ownership.refresh();
        } catch (e) {
            setStep({ kind: 'error', message: describeMintError(e) });
            refresh();
        }
    };

    const linkHolder = async () => {
        if (!browser.wallet || !browser.account) return;
        setLinkState('signing');
        try {
            const message = holderMessage(browser.account, new Date());
            const signature = await signWithWallet(browser.wallet, browser.account, message);
            ownership.addHolder({ address: browser.account, message, signature, linkedAt: Date.now() });
            setLinkState('linked');
        } catch {
            setLinkState('error');
        }
    };

    const alreadyLinked = !!browser.account && (
        ownership.holders.some(h => h.address.toLowerCase() === browser.account!.toLowerCase())
        || ownership.vaultAddress?.toLowerCase() === browser.account.toLowerCase());

    const phaseLabel = !sale.deployed ? 'Opening soon' : remaining === 0 ? 'Sold out' : sale.phase === 'allowlist' ? 'Allowlist' : sale.phase === 'public' ? 'Public mint' : 'Not open yet';

    return (
        <Dialog
            open={open}
            onClose={busy ? () => undefined : onClose}
            dismissible={!busy}
            size="xl"
            title="Iced-Out XR Watches"
            icon={<Gem size={20} className="text-purple-300" aria-hidden />}
            footer="Previews only — a watch's wallet and DeFi desk work in Bolt XR once your wallet holds it"
        >
            <div className="mint-layout">
                <WatchTryOn edition={selected} mode={mode} onModeChange={setMode} celebrate={celebrate} />

                <section className="mint-panel" aria-label="Edition and mint">
                    <header className="mint-edition">
                        <div className="mint-edition-meta">
                            <span className="mint-rarity" style={{ ['--rarity' as string]: rarityColor(spec.rarity) }}>{spec.rarity}</span>
                            <span className="mono text-slate-400">#{pad(selected)} of 150</span>
                            {sale.deployed && selected <= sale.minted && <span className="pill">Minted</span>}
                        </div>
                        <h3 className="mint-edition-name">{spec.edition}</h3>
                        <dl className="mint-traits">
                            {SHOWN_TRAITS.map(t => {
                                const v = meta.attributes.find(a => a.trait_type === t)?.value;
                                return v ? (
                                    <div key={t}>
                                        <dt>{TRAIT_LABEL[t]}</dt>
                                        <dd>{v}</dd>
                                    </div>
                                ) : null;
                            })}
                        </dl>
                    </header>

                    <div className="mint-sale">
                        <div className="mint-sale-row">
                            <div>
                                <div className="mint-label">{next ? `Mint #${pad(next)} now` : 'Sold out'}</div>
                                <div className="mint-price mono">{sale.nextPriceWei !== null ? formatEth(sale.nextPriceWei) : '—'}</div>
                            </div>
                            <div className="mint-sale-status">
                                <span className={`pill ${sale.phase === 'public' && remaining > 0 ? 'pill-success' : sale.phase === 'allowlist' ? 'pill-brand' : ''}`}>{phaseLabel}</span>
                                <span className="mono text-[11px] text-slate-400">{sale.minted} / {SUPPLY} minted</span>
                            </div>
                        </div>
                        <div className="mint-progress" aria-hidden><span style={{ width: `${(sale.minted / SUPPLY) * 100}%` }} /></div>
                        {next && selected !== next && (
                            <p className="mint-note">
                                Mints go in order, so the next one you can mint is #{pad(next)} {editionInfo(next).edition}.{' '}
                                <button type="button" className="mint-link" onClick={() => setPicked(next)}>Preview #{pad(next)}</button>
                            </p>
                        )}
                    </div>

                    {plan && sale.deployed && (
                        <div className="mint-order">
                            <div className="mint-qty">
                                <span className="mint-label">Watches</span>
                                <div className="mint-stepper">
                                    <button type="button" className="icon-btn" aria-label="One fewer" disabled={qty <= 1 || busy} onClick={() => setQuantity(Math.max(1, qty - 1))}><Minus size={14} /></button>
                                    <output aria-live="polite" className="mono">{qty}</output>
                                    <button type="button" className="icon-btn" aria-label="One more" disabled={qty >= maxQty || busy} onClick={() => setQuantity(Math.min(maxQty, qty + 1))}><Plus size={14} /></button>
                                </div>
                                <span className="mono text-[11px] text-slate-400">{idRange(plan.ids)}</span>
                            </div>
                            <div className="mint-cost">
                                <div className="flex items-baseline justify-between gap-3">
                                    <span className="text-sm text-slate-300">You pay</span>
                                    <span className="mono text-lg font-bold">{formatEth(plan.costWei)}</span>
                                </div>
                                <label className="mint-protect">
                                    <input type="checkbox" checked={protect} onChange={e => setProtect(e.target.checked)} disabled={busy} />
                                    <span>
                                        Price protection — if up to {MINT_CONFIG.protectMints} others mint first, pay at most{' '}
                                        <b className="mono">{formatEth(planMint(sale.minted, qty, MINT_CONFIG.protectMints).valueWei)}</b>.
                                        Whatever isn&apos;t needed comes straight back in the same transaction.
                                    </span>
                                </label>
                                <p className="text-[11px] text-slate-500">Plus the {MINT_CONFIG.chain.name} network fee.</p>
                            </div>
                        </div>
                    )}

                    <div className="mint-actions">
                        {vaultReady && (
                            <div className="segmented mint-paywith" role="group" aria-label="Pay with">
                                <button type="button" aria-pressed={via === 'browser'} onClick={() => setPayWith('browser')}>Browser wallet</button>
                                <button type="button" aria-pressed={via === 'vault'} onClick={() => setPayWith('vault')}>Bolt vault</button>
                            </div>
                        )}

                        {via === 'browser' && !browser.account && (
                            browser.wallets.length > 0 ? (
                                <div className="mint-wallets">
                                    {browser.wallets.map(w => (
                                        <button key={w.id} type="button" className="btn btn-block" disabled={browser.busy} onClick={() => browser.connect(w)}>
                                            {w.icon
                                                // eslint-disable-next-line @next/next/no-img-element -- wallet-supplied data: URI
                                                ? <img src={w.icon} alt="" width={18} height={18} />
                                                : <Wallet size={16} aria-hidden />}
                                            Connect {w.name}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <p className="mint-note">
                                    No browser wallet found. Install one such as MetaMask or Rabby{VAULT_CHAIN_KEY ? ', or unlock your Bolt vault to mint with it' : ''}.
                                </p>
                            )
                        )}

                        {account && (
                            <div className="mint-account">
                                <span className="mono">{short(account)}</span>
                                {sale.phase === 'allowlist' && sale.holdsPass !== null && (
                                    sale.holdsPass
                                        ? <span className="pill pill-success"><ShieldCheck size={12} aria-hidden /> Allowlist pass</span>
                                        : <span className="pill pill-warning">No pass</span>
                                )}
                                {sale.walletLimit > 0 && <span className="text-[11px] text-slate-400">{Math.max(0, sale.walletLimit - sale.walletMinted)} of {sale.walletLimit} left for this address</span>}
                                {via === 'browser' && <button type="button" className="mint-link ml-auto" onClick={browser.disconnect}>Disconnect</button>}
                            </div>
                        )}

                        {wrongChain ? (
                            <button type="button" className="btn btn-primary btn-lg btn-block" disabled={browser.busy} onClick={browser.switchChain}>
                                Switch to {MINT_CONFIG.chain.name}
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="btn btn-primary btn-lg btn-block"
                                disabled={!plan || !account || !!blocker || busy}
                                onClick={mint}
                                data-testid="mint-button"
                            >
                                {step.kind === 'confirm' ? <><Loader2 size={16} className="animate-spin" aria-hidden /> {via === 'vault' ? 'Signing…' : 'Confirm in your wallet'}</>
                                    : step.kind === 'pending' ? <><Loader2 size={16} className="animate-spin" aria-hidden /> Minting…</>
                                        : plan ? `Mint ${idRange(plan.ids)}` : 'Sold out'}
                            </button>
                        )}

                        {blocker && <p className="mint-note" role="status">{blocker}</p>}
                        {(browser.error || saleError) && step.kind !== 'error' && <p className="notice notice-warning text-xs">{browser.error || saleError}</p>}
                        {step.kind === 'error' && <p className="notice notice-danger text-xs" role="alert">{step.message}</p>}
                        {step.kind === 'pending' && explorerTx(step.hash) && (
                            <a className="mint-link" href={explorerTx(step.hash)} target="_blank" rel="noopener noreferrer">
                                View the transaction <ExternalLink size={12} aria-hidden />
                            </a>
                        )}
                        {step.kind === 'done' && (
                            <div className="notice notice-success text-xs" role="status">
                                <p className="flex items-center gap-2 font-bold"><BadgeCheck size={14} aria-hidden /> Minted {idRange(step.ids)}.</p>
                                {step.via === 'vault' || alreadyLinked || linkState === 'linked' ? (
                                    <p className="mt-1">Wear it in Bolt XR: Settings → Wrist watch.</p>
                                ) : (
                                    <p className="mt-1">
                                        To wear it in Bolt XR on this device, link this wallet — you sign a message, nothing is sent.{' '}
                                        <button type="button" className="mint-link" onClick={linkHolder} disabled={linkState === 'signing'}>
                                            <Link2 size={12} aria-hidden /> {linkState === 'signing' ? 'Waiting for signature…' : linkState === 'error' ? 'Try linking again' : 'Link wallet'}
                                        </button>
                                    </p>
                                )}
                                {explorerTx(step.hash) && (
                                    <a className="mint-link mt-1" href={explorerTx(step.hash)} target="_blank" rel="noopener noreferrer">
                                        Transaction <ExternalLink size={12} aria-hidden />
                                    </a>
                                )}
                            </div>
                        )}
                    </div>

                    <p className="mint-fineprint">
                        {sale.deployed ? (
                            <>Contract {explorerAddress(MINT_CONFIG.contract)
                                ? <a className="mint-link" href={explorerAddress(MINT_CONFIG.contract)} target="_blank" rel="noopener noreferrer">{short(MINT_CONFIG.contract)}</a>
                                : <span className="mono">{short(MINT_CONFIG.contract)}</span>} on {MINT_CONFIG.chain.name}{MINT_CONFIG.chain.testnet ? ' (local test chain)' : ''}. </>
                        ) : null}
                        #1 costs 0.001 ETH and every mint lifts the next price by about 4.75 %, up to 1 ETH for #150; selling out raises {SELL_OUT_ETH.toFixed(2)} ETH in total.
                    </p>
                </section>
            </div>

            <PriceTrack minted={sale.minted} selected={selected} onSelect={pick} />
            <EditionStrip selected={selected} minted={sale.minted} deployed={sale.deployed} onSelect={pick} />
        </Dialog>
    );
}
