'use client';

/**
 * useHolderVerdict — the worn watch's own holder check (lib/mint/holderCheck.ts), run every time
 * the watch is put on. 'checking' until the chain answers; 'offline' after a few failed tries
 * (it keeps retrying); 'stolen' latches — nothing later turns it back.
 */

import { useEffect, useState } from 'react';
import { checkHolder, holderAddresses, type HolderVerdict } from '@/lib/mint/holderCheck';

export type HolderState = HolderVerdict | 'checking';

export function useHolderVerdict(edition: number, vaultAddress: string | null): HolderState {
    const [state, setState] = useState<{ edition: number; verdict: HolderState }>({ edition, verdict: 'checking' });

    useEffect(() => {
        let cancelled = false;
        let timer = 0;
        let attempt = 0;
        const run = () => {
            checkHolder(edition, holderAddresses(vaultAddress))
                .then(v => {
                    if (cancelled) return;
                    setState(s => (s.edition === edition && s.verdict === 'stolen' ? s : { edition, verdict: v }));
                })
                .catch(() => {
                    if (cancelled) return;
                    attempt++;
                    if (attempt >= 3) setState(s => (s.edition === edition && s.verdict === 'stolen' ? s : { edition, verdict: 'offline' }));
                    timer = window.setTimeout(run, Math.min(30_000, 1500 * 2 ** attempt));
                });
        };
        run();
        return () => { cancelled = true; window.clearTimeout(timer); };
    }, [edition, vaultAddress]);

    return state.edition === edition ? state.verdict : 'checking';
}
