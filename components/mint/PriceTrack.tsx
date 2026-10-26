'use client';

/**
 * PriceTrack — the 150 mints as a watch's minute track: one tick per watch, its height the
 * price (log scale, 0.001 → 1 ETH), filled once minted, the next one lit. Pick a tick to
 * preview that edition. One tab stop; arrow keys move, Home/End jump.
 */

import { useCallback, useRef } from 'react';
import { PRICE_MICRO, SUPPLY, priceEth } from '@/lib/mint/priceTable';
import { editionInfo } from '@/lib/mint/editions';
import { RARITY_COLOR } from './rarity';

interface PriceTrackProps {
    minted: number;
    selected: number;
    onSelect: (id: number) => void;
}

const LOG_MIN = Math.log10(PRICE_MICRO[0]);
const LOG_MAX = Math.log10(PRICE_MICRO[SUPPLY - 1]);

export const formatPrice = (eth: number) =>
    eth >= 0.1 ? eth.toFixed(eth >= 1 ? 2 : 3) : eth.toPrecision(3).replace(/0+$/, '').replace(/\.$/, '');

const BANDS: { from: number; to: number; rarity: 'Rare' | 'Epic' | 'Legendary' | 'Mythic' }[] = [
    { from: 1, to: 49, rarity: 'Rare' },
    { from: 50, to: 99, rarity: 'Epic' },
    { from: 100, to: 149, rarity: 'Legendary' },
    { from: 150, to: 150, rarity: 'Mythic' },
];

export default function PriceTrack({ minted, selected, onSelect }: PriceTrackProps) {
    const ref = useRef<HTMLDivElement>(null);
    const next = minted < SUPPLY ? minted + 1 : null;

    const idAt = useCallback((clientX: number) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return selected;
        return Math.min(SUPPLY, Math.max(1, Math.floor(((clientX - r.left) / r.width) * SUPPLY) + 1));
    }, [selected]);

    const onKey = (e: React.KeyboardEvent) => {
        const step = e.shiftKey ? 10 : 1;
        let id = selected;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') id += step;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') id -= step;
        else if (e.key === 'Home') id = 1;
        else if (e.key === 'End') id = SUPPLY;
        else if (e.key === 'PageUp') id += 10;
        else if (e.key === 'PageDown') id -= 10;
        else return;
        e.preventDefault();
        onSelect(Math.min(SUPPLY, Math.max(1, id)));
    };

    const spec = editionInfo(selected);
    const selectedLeft = ((selected - 0.5) / SUPPLY) * 100;

    return (
        <div className="mint-track">
            <div className="mint-track-head">
                <span>Price per watch rises with every mint</span>
                <span className="mono">0.001 → 1 ETH</span>
            </div>
            <div
                ref={ref}
                role="slider"
                tabIndex={0}
                aria-label="Preview an edition"
                aria-valuemin={1}
                aria-valuemax={SUPPLY}
                aria-valuenow={selected}
                aria-valuetext={`#${selected} ${spec.edition}, ${formatPrice(priceEth(selected))} ETH${selected <= minted ? ', minted' : selected === next ? ', next to mint' : ''}`}
                className="mint-track-ticks"
                onKeyDown={onKey}
                onPointerDown={e => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); onSelect(idAt(e.clientX)); }}
                onPointerMove={e => { if (e.buttons & 1) onSelect(idAt(e.clientX)); }}
            >
                {PRICE_MICRO.map((p, i) => {
                    const id = i + 1;
                    const h = 14 + ((Math.log10(p) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 86;
                    const state = id <= minted ? 'sold' : id === next ? 'next' : 'open';
                    return (
                        <span
                            key={id}
                            className={`mint-tick mint-tick-${state}${id === selected ? ' mint-tick-selected' : ''}${id % 10 === 0 ? ' mint-tick-major' : ''}`}
                            style={{ height: `${h}%` }}
                            aria-hidden
                        />
                    );
                })}
                <span className="mint-track-cursor" style={{ left: `${selectedLeft}%` }} aria-hidden />
                <span className="mint-track-label mono" style={{ left: `clamp(48px, ${selectedLeft}%, calc(100% - 48px))` }} aria-hidden>
                    #{String(selected).padStart(3, '0')} · {formatPrice(priceEth(selected))} ETH
                </span>
            </div>
            <div className="mint-track-bands" aria-hidden>
                {BANDS.map(b => (
                    <span key={b.rarity} style={{ flex: b.to - b.from + 1, color: RARITY_COLOR[b.rarity] }}>
                        <i style={{ background: RARITY_COLOR[b.rarity] }} />
                        {b.rarity === 'Mythic' ? '' : `${b.rarity} ${b.from}–${b.to}`}
                    </span>
                ))}
            </div>
        </div>
    );
}
