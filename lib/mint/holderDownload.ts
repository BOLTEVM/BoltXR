/**
 * lib/mint/holderDownload.ts — a holder downloads their watch's 3D model (GLB).
 *
 * The models are not public: the holder server (the private watch module's server/, a
 * Cloudflare Worker) streams one only to the address that holds it on chain right now, after
 * that address signs a message. This file is the wallet's side:
 *
 *   1. ask the server for a request (a random id, a time limit and the server's ticket);
 *   2. build the message here, from fields checked here — this page's site, the holder address,
 *      this build's contract and chain, the server's own download URL — so the server never
 *      decides what a wallet signs. It is a Sign-In-with-Ethereum (EIP-4361) message, so a
 *      browser wallet warns if a look-alike site relays it;
 *   3. have the holder address sign it (the vault, or the linked browser wallet), send it back,
 *      and save the GLB it returns.
 *
 * The template must stay identical to the server's (server/src/message.ts); the server's tests
 * check both.
 */

import { MINT_CONFIG } from './config';

/** The holder server, from NEXT_PUBLIC_WATCH_HOLDER_API; '' hides the download buttons. */
export function holderApiFrom(value: string | undefined): string {
    const v = (value ?? '').trim().replace(/\/+$/, '');
    if (/^https:\/\/[^\s/]+(\/\S*)?$/.test(v)) return v;
    // plain http only for a server on this machine (wrangler dev)
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(v)) return v;
    return '';
}

export const HOLDER_API = holderApiFrom(process.env.NEXT_PUBLIC_WATCH_HOLDER_API);

export interface DownloadRequest {
    /** Host of the wallet page asking (window.location.host), e.g. "wallet.boltevm.io". */
    domain: string;
    /** EIP-55 checksummed holder address. */
    address: string;
    /** Edition 1…150. */
    watch: number;
    chainId: number;
    /** EIP-55 checksummed IcedOutXRWatches address. */
    contract: string;
    /** The download URL on the holder server: <server>/v1/watch/<watch>.glb */
    uri: string;
    /** 32 lowercase hex characters, from the server. */
    nonce: string;
    /** ISO 8601 UTC, from the server. */
    issuedAt: string;
    /** ISO 8601 UTC, from the server. */
    expires: string;
}

export const pad3 = (n: number) => String(n).padStart(3, '0');

export function chainLabel(chainId: number): string {
    return chainId === 1 ? 'Ethereum' : chainId === 31337 ? 'Hardhat local' : `chain ${chainId}`;
}

/** The text the holder signs (same template as server/src/message.ts). */
export function holderDownloadMessage(r: DownloadRequest): string {
    return [
        `${r.domain} wants you to sign in with your Ethereum account:`,
        r.address,
        '',
        `Download the 3D model of Iced-Out XR watch #${pad3(r.watch)} (contract ${r.contract} on ${chainLabel(r.chainId)}), which this address holds. This sends no transaction and costs nothing.`,
        '',
        `URI: ${r.uri}`,
        'Version: 1',
        `Chain ID: ${r.chainId}`,
        `Nonce: ${r.nonce}`,
        `Issued At: ${r.issuedAt}`,
        `Expiration Time: ${r.expires}`,
    ].join('\n');
}

export class HolderDownloadError extends Error {
    constructor(message: string, readonly code: string = 'error') {
        super(message);
        this.name = 'HolderDownloadError';
    }
}

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Check the server's answer against what this build knows before anything is signed: the same
 * holder, watch, contract and chain; a well-formed request id; a time limit in the next 10 minutes.
 */
export function acceptRequest(
    answer: unknown, expect: { address: string; watch: number; chainId: number; contract: string; domain: string; uri: string }, now = Date.now(),
): DownloadRequest & { ticket: string } {
    const a = (answer ?? {}) as Record<string, unknown>;
    const ok = typeof a.address === 'string' && sameAddress(a.address, expect.address)
        && a.watch === expect.watch
        && a.chainId === expect.chainId
        && typeof a.contract === 'string' && sameAddress(a.contract, expect.contract)
        && typeof a.nonce === 'string' && /^[0-9a-f]{32}$/.test(a.nonce)
        && typeof a.issuedAt === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(a.issuedAt)
        && typeof a.expires === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(a.expires)
        && typeof a.ticket === 'string' && /^[A-Za-z0-9_-]{43}$/.test(a.ticket);
    if (!ok) throw new HolderDownloadError('The download server answered for a different watch, contract or chain. Nothing was signed.', 'mismatch');
    const left = Date.parse(a.expires as string) - now;
    if (!(left > 0 && left <= 10 * 60_000)) throw new HolderDownloadError('The download request has an odd time limit (check this device\'s clock). Nothing was signed.', 'clock');
    return {
        domain: expect.domain, address: a.address as string, watch: expect.watch, chainId: expect.chainId, contract: a.contract as string,
        uri: expect.uri, nonce: a.nonce as string, issuedAt: a.issuedAt as string, expires: a.expires as string, ticket: a.ticket as string,
    };
}

async function readError(res: Response): Promise<HolderDownloadError> {
    try {
        const body = await res.json() as { error?: string; message?: string };
        return new HolderDownloadError(body.message || `The download server answered ${res.status}.`, body.error || String(res.status));
    } catch {
        return new HolderDownloadError(`The download server answered ${res.status}.`, String(res.status));
    }
}

export interface HolderDownload {
    blob: Blob;
    filename: string;
}

/**
 * Download edition `watch` as `address` (its holder), signing with `sign` (EIP-191 personal_sign
 * by that address). Throws HolderDownloadError with the server's reason when refused.
 */
export async function downloadHolderWatch(opts: {
    api?: string; address: string; watch: number; sign: (message: string) => Promise<string>; fetchFn?: typeof fetch;
    /** This page's host; defaults to window.location.host. */
    domain?: string;
}): Promise<HolderDownload> {
    const api = opts.api ?? HOLDER_API;
    const fetchFn = opts.fetchFn ?? fetch;
    if (!api) throw new HolderDownloadError('No download server is set for this build.', 'no-server');
    if (!MINT_CONFIG.contract) throw new HolderDownloadError('The watch contract is not deployed yet.', 'no-contract');
    const domain = opts.domain ?? (typeof window !== 'undefined' ? window.location.host : '');
    if (!domain) throw new HolderDownloadError('Downloads work from the wallet\'s own page only.', 'no-domain');
    const uri = `${api}/v1/watch/${opts.watch}.glb`;
    const expect = { address: opts.address, watch: opts.watch, chainId: MINT_CONFIG.chain.chainId, contract: MINT_CONFIG.contract, domain, uri };

    const q = new URLSearchParams({ address: opts.address, watch: String(opts.watch) });
    const res = await fetchFn(`${api}/v1/challenge?${q}`, { method: 'GET', credentials: 'omit' });
    if (!res.ok) throw await readError(res);
    const req = acceptRequest(await res.json(), expect);

    const signature = await opts.sign(holderDownloadMessage(req));
    const got = await fetchFn(uri, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            address: req.address, domain: req.domain, nonce: req.nonce, issuedAt: req.issuedAt, expires: req.expires, ticket: req.ticket, signature,
        }),
    });
    if (!got.ok) throw await readError(got);
    return { blob: await got.blob(), filename: `iced-out-xr-${pad3(req.watch)}.glb` };
}

/** Hand the file to the browser's download. */
export function saveDownload({ blob, filename }: HolderDownload): void {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
