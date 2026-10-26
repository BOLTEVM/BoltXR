import { MINT_CONFIG } from '@/lib/mint/config';

/** Rarity accents shared by the mint modal and the wallet's watch picker. */
export const RARITY_COLOR: Record<string, string> = {
    Rare: '#8fd8ff',
    Epic: '#c4a1ff',
    Legendary: '#f2c96b',
    Mythic: '#ff9fc4',
};

export const rarityColor = (rarity: string) => RARITY_COLOR[rarity] ?? '#cbd5e1';

/**
 * Pre-rendered gallery thumbnail for edition `id`: from the permaweb when
 * NEXT_PUBLIC_WATCH_ART_BASE is set (thumbs/ in the images manifest), otherwise from
 * public/watches/thumbs, which exists only on the machine that rendered them.
 */
export const thumbUrl = (id: number, base: string = MINT_CONFIG.artBase) => {
    const file = `watch_${String(id).padStart(3, '0')}.jpg`;
    return base ? `${base}thumbs/${file}` : `/watches/thumbs/${file}`;
};
