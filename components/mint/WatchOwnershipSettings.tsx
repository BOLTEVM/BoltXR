'use client';

/**
 * WatchOwnershipSettings — Settings → Wrist watch: pick a watch you hold, see which addresses
 * hold what, link another wallet that holds one (by signing a message with it), and download the
 * 3D model of a watch you hold from the holder server.
 */

import { useEffect, useState } from 'react';
import { Download, Link2, RefreshCw, Unlink, Wallet } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { useWallet } from '@/hooks/useWallet';
import { useWatchOwnership } from '@/hooks/useWatchOwnership';
import { walletCore } from '@/lib/boltows/core-instance';
import { MINT_CONFIG } from '@/lib/mint/config';
import { holderMessage } from '@/lib/mint/ownership';
import { discoverWallets, requestAccount, sharedAccounts, signWithWallet, type BrowserWallet } from '@/lib/mint/wallets';
import { describeMintError } from '@/lib/mint/client';
import { HOLDER_API, HolderDownloadError, downloadHolderWatch, saveDownload } from '@/lib/mint/holderDownload';
import { editionList } from '@/lib/mint/editions';

const EDITIONS = editionList();
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const list = (ids: number[]) => ids.map(id => `#${String(id).padStart(3, '0')}`).join(', ');

export default function WatchOwnershipSettings() {
    const { setWatchEdition } = useSettings();
    const own = useWatchOwnership();
    const [wallets, setWallets] = useState<BrowserWallet[]>([]);
    const [linking, setLinking] = useState<string | null>(null);
    const [linkError, setLinkError] = useState<string | null>(null);
    const { walletId } = useWallet();
    const [downloading, setDownloading] = useState<number | null>(null);
    const [downloadNote, setDownloadNote] = useState<{ ok: boolean; text: string } | null>(null);

    useEffect(() => discoverWallets(setWallets), []);

    const wearable = EDITIONS.filter(e => own.verified.includes(e.id));
    const value = own.wornEdition;

    const link = async (w: BrowserWallet) => {
        setLinking(w.id);
        setLinkError(null);
        try {
            const address = await requestAccount(w);
            const message = holderMessage(address, new Date());
            const signature = await signWithWallet(w, address, message);
            own.addHolder({ address, message, signature, linkedAt: Date.now() });
        } catch (e) {
            setLinkError(describeMintError(e));
        } finally {
            setLinking(null);
        }
    };

    /** Sign as the address that holds `id` — the vault itself, or the linked browser wallet. */
    const download = async (id: number) => {
        const holder = Object.keys(own.byAddress).find(a => own.byAddress[a]?.includes(id));
        setDownloading(id);
        setDownloadNote(null);
        try {
            if (!holder) throw new HolderDownloadError(`None of your addresses holds #${String(id).padStart(3, '0')} right now.`);
            let sign: (message: string) => Promise<string>;
            if (own.vaultAddress && holder.toLowerCase() === own.vaultAddress.toLowerCase()) {
                if (!walletId) throw new HolderDownloadError('Unlock your vault first: it signs as the address that holds this watch.');
                sign = message => walletCore.signEvmMessage(walletId, message);
            } else {
                // the wallet that already shares the holder address (no prompt), else ask the first one
                let w: BrowserWallet | undefined;
                for (const candidate of wallets) {
                    if ((await sharedAccounts(candidate)).some(a => a.toLowerCase() === holder.toLowerCase())) { w = candidate; break; }
                }
                if (!w) {
                    w = wallets[0];
                    if (!w) throw new HolderDownloadError(`Open the browser wallet that holds ${short(holder)} to sign.`);
                    const account = await requestAccount(w);
                    if (account.toLowerCase() !== holder.toLowerCase()) {
                        throw new HolderDownloadError(`${w.name} shared ${short(account)}. Switch it to ${short(holder)}, the address that holds this watch, and try again${wallets.length > 1 ? ' (or use the wallet you linked it from)' : ''}.`);
                    }
                }
                const signer = w;
                sign = message => signWithWallet(signer, holder, message);
            }
            const file = await downloadHolderWatch({ address: holder, watch: id, sign });
            saveDownload(file);
            setDownloadNote({ ok: true, text: `Saved ${file.filename}.` });
        } catch (e) {
            setDownloadNote({ ok: false, text: e instanceof HolderDownloadError ? e.message : describeMintError(e) });
        } finally {
            setDownloading(null);
        }
    };

    const status = own.status === 'no-contract'
        ? 'The Iced-Out XR Watches mint has not opened yet. Until you hold one, your wrist wears the classic watch — try them on from the home page.'
        : own.status === 'no-address'
            ? 'Unlock your vault or link a wallet to wear the Iced-Out XR watch you hold.'
            : own.status === 'checking'
                ? `Checking ${MINT_CONFIG.chain.name} for the watches your addresses hold…`
                : own.status === 'error'
                    ? `Could not reach ${MINT_CONFIG.chain.name} — showing what your addresses held last time.`
                    : own.owned.length === 0
                        ? 'None of your addresses holds an Iced-Out XR watch yet. Mint one from the home page, or link the wallet that holds yours.'
                        : `You hold ${own.owned.length === 1 ? 'one watch' : `${own.owned.length} watches`}: ${list(own.owned)}.`;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
                <label htmlFor="watch-edition" className="text-sm font-bold">Edition</label>
                <select
                    id="watch-edition"
                    className="input"
                    value={value}
                    onChange={(e) => setWatchEdition(Number(e.target.value))}
                >
                    <option value={0}>Classic Wrist OS (titanium)</option>
                    {wearable.map(ed => (
                        <option key={ed.id} value={ed.id}>{ed.name} · {ed.rarity}</option>
                    ))}
                </select>
                <p className="text-[11px] text-slate-500 leading-relaxed">{status}</p>
            </div>

            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">Holder addresses</span>
                    {own.status !== 'no-contract' && (
                        <button type="button" className="icon-btn" onClick={own.refresh} aria-label="Check again"><RefreshCw size={14} /></button>
                    )}
                </div>
                <ul className="flex flex-col gap-1.5 text-xs">
                    {own.vaultAddress && (
                        <li className="flex items-center gap-2">
                            <span className="mono">{short(own.vaultAddress)}</span>
                            <span className="text-slate-500">this vault</span>
                            <span className="ml-auto text-slate-400">{list(own.byAddress[own.vaultAddress] ?? []) || '—'}</span>
                        </li>
                    )}
                    {own.holders.map(h => (
                        <li key={h.address} className="flex items-center gap-2">
                            <span className="mono">{short(h.address)}</span>
                            <span className="text-slate-500">linked</span>
                            <span className="ml-auto text-slate-400">{list(own.byAddress[h.address] ?? []) || '—'}</span>
                            <button type="button" className="icon-btn" onClick={() => own.forgetHolder(h.address)} aria-label={`Unlink ${short(h.address)}`}><Unlink size={12} /></button>
                        </li>
                    ))}
                    {!own.vaultAddress && own.holders.length === 0 && <li className="text-slate-500">None yet.</li>}
                </ul>
                {wallets.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {wallets.map(w => (
                            <button key={w.id} type="button" className="btn btn-sm" disabled={!!linking} onClick={() => link(w)}>
                                {linking === w.id ? <RefreshCw size={12} className="animate-spin" /> : w.icon
                                    // eslint-disable-next-line @next/next/no-img-element -- wallet-supplied data: URI
                                    ? <img src={w.icon} alt="" width={14} height={14} />
                                    : <Wallet size={12} />}
                                <Link2 size={12} aria-hidden /> Link {w.name}
                            </button>
                        ))}
                    </div>
                )}
                {linkError && <p className="text-[11px] text-red-300">{linkError}</p>}
                <p className="text-[11px] text-slate-500 leading-relaxed">
                    Linking asks the wallet to sign a message — it proves you control the address and moves nothing. Holding a watch in this vault works too: send it to {own.vaultAddress ? short(own.vaultAddress) : 'your vault address'}.
                </p>
            </div>

            {HOLDER_API && own.owned.length > 0 && (
                <div className="flex flex-col gap-2">
                    <span className="text-sm font-bold">3D models</span>
                    <div className="flex flex-wrap gap-2">
                        {own.owned.map(id => (
                            <button key={id} type="button" className="btn btn-sm" disabled={downloading !== null} onClick={() => download(id)}>
                                {downloading === id ? <RefreshCw size={12} className="animate-spin" aria-hidden /> : <Download size={12} aria-hidden />}
                                #{String(id).padStart(3, '0')} (GLB)
                            </button>
                        ))}
                    </div>
                    {downloadNote && <p className={`text-[11px] ${downloadNote.ok ? 'text-emerald-300' : 'text-red-300'}`} role="status">{downloadNote.text}</p>}
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                        The model of a watch you hold, for use in other 3D apps. The address that holds it signs a message to prove it; nothing is sent from your wallet. Models are never public: the server checks the chain before every download.
                    </p>
                </div>
            )}
        </div>
    );
}
