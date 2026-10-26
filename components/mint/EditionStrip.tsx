'use client';

/** EditionStrip — all 150 watches as a scrolling row of studio thumbnails; pick one to preview it. */

import { memo, useEffect, useRef, useState } from 'react';
import { editionList } from '@/lib/mint/editions';
import { rarityColor, thumbUrl } from './rarity';

const EDITIONS = editionList().map(e => ({ ...e, title: e.name.replace(/^#\d+ · /, '') }));

interface EditionStripProps {
    selected: number;
    minted: number;
    deployed: boolean;
    onSelect: (id: number) => void;
}

const Thumb = memo(function Thumb({ id, title, rarity, state, selected, onSelect }: {
    id: number; title: string; rarity: string; state: 'minted' | 'next' | 'open'; selected: boolean; onSelect: (id: number) => void;
}) {
    const [broken, setBroken] = useState(false);
    return (
        <button
            type="button"
            data-id={id}
            onClick={() => onSelect(id)}
            className={`mint-thumb${selected ? ' is-selected' : ''}`}
            aria-pressed={selected}
            aria-label={`Preview #${id} ${title}, ${rarity}${state === 'minted' ? ', minted' : state === 'next' ? ', next to mint' : ''}`}
        >
            <span className="mint-thumb-img" style={{ ['--rarity' as string]: rarityColor(rarity) }}>
                {!broken && (
                    // eslint-disable-next-line @next/next/no-img-element -- static export, pre-sized thumbnails
                    <img src={thumbUrl(id)} alt="" loading="lazy" decoding="async" width={128} height={128} onError={() => setBroken(true)} />
                )}
                {state !== 'open' && <span className={`mint-thumb-flag is-${state}`}>{state === 'minted' ? 'Minted' : 'Next'}</span>}
            </span>
            <span className="mint-thumb-id mono">#{String(id).padStart(3, '0')}</span>
        </button>
    );
});

export default function EditionStrip({ selected, minted, deployed, onSelect }: EditionStripProps) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // horizontal only: scrollIntoView would also scroll the dialog body to bring the strip into view
        const strip = ref.current;
        const el = strip?.querySelector<HTMLElement>(`[data-id="${selected}"]`);
        if (!strip || !el) return;
        const left = el.offsetLeft - strip.offsetLeft - (strip.clientWidth - el.clientWidth) / 2;
        strip.scrollTo({ left, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }, [selected]);

    return (
        <div ref={ref} className="mint-strip" role="group" aria-label="All 150 editions">
            {EDITIONS.map(e => (
                <Thumb
                    key={e.id}
                    id={e.id}
                    title={e.title}
                    rarity={e.rarity}
                    state={deployed && e.id <= minted ? 'minted' : e.id === minted + 1 ? 'next' : 'open'}
                    selected={e.id === selected}
                    onSelect={onSelect}
                />
            ))}
        </div>
    );
}
