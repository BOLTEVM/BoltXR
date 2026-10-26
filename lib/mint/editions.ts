/**
 * lib/mint/editions.ts — the 150 Iced-Out XR editions as the public sees them: name, traits,
 * edition title and rarity (exactly what each token's metadata says on a marketplace).
 *
 * GENERATED from 150Watches/manifest.json by private/iced-out/scripts/build-editions.ts —
 * do not edit by hand. Each token is six base-36 digits indexing TRAITS, in the order:
 * network, case material, setting, accent, centrepiece, rarity. How a watch is built from
 * these traits lives in the private watch module, not here.
 */

export const TRAIT_NAMES = ["Network Endpoint","Case Material","Diamond Setting Style","Gemstone Accent","Centerpiece Branding","Rarity Tier"] as const;

export type Rarity = 'Rare' | 'Epic' | 'Legendary' | 'Mythic';

export interface EditionAttribute { trait_type: string; value: string }

/** ERC-721 metadata, traits only. */
export interface EditionMetadata { token_id: number; name: string; attributes: EditionAttribute[] }

export interface EditionInfo {
    id: number;
    /** Token name, e.g. "150 Iced-Out XR Wallet #001 — Bitcoin Edition". */
    name: string;
    /** Short edition title, e.g. "Bitcoin Sovereign Gold". */
    edition: string;
    rarity: Rarity;
}

const TRAITS: readonly (readonly string[])[] = [
    [
        "Bitcoin (BTC)",
        "Polygon (POL)",
        "Quai Network (QUAI)",
        "Ethereum (ETH)",
        "Solana (SOL)",
        "Omnichain Genesis / BOLTEVM Black-Tier"
    ],
    [
        "18K Sovereign Yellow Gold",
        "950 Pure Platinum",
        "18K Rose Gold",
        "Forged Carbon Fiber & Titanium",
        "Obsidian Black Titanium & Gold",
        "Hand-Carved Obsidian Black Titanium & Damascus Gold"
    ],
    [
        "150-Carat Mixed Baguette & Micro-Pavé",
        "150-Carat Emerald Cut Channel Set",
        "150-Carat Pavé Brilliant Cut",
        "150-Carat Baguette Invisible Set",
        "150-Carat Black Carbonado Diamonds & Vivid Yellow Canary Diamonds"
    ],
    [
        "Canary Yellow Diamonds",
        "Royal Purple Amethysts",
        "Pigeon-Blood Rubies",
        "Ice-Blue Sapphires",
        "Colombian Emeralds",
        "Dante's Gilded Baroque Masquerade Filigree"
    ],
    [
        "BOLTEVM Cyan Enamel Tourbillon Lightning Bolt",
        "BOLTEVM Platinum Floating Holographic Bolt",
        "BOLTEVM Amber-Gold Braided Consensual Core",
        "BOLTEVM Emerald Prismatic Lightning Cage",
        "BOLTEVM Emblem Entwined with Dante's Gilded Masquerade Mask"
    ],
    [
        "Rare",
        "Epic",
        "Legendary",
        "Mythic (1-of-1 Ultra-Rare)"
    ]
];

const CODES = '000000 111110 222220 333330 440400 001000 112110 223220 330330 441400 002000 113110 220220 331330 442400 003000 110110 221220 332330 443400 000000 111110 222220 333330 440400 001000 112110 223220 330330 441400 002000 113110 220220 331330 442400 003000 110110 221220 332330 443400 000000 111110 222220 333330 440400 001000 112110 223220 330330 441401 002001 113111 220221 331331 442401 003001 110111 221221 332331 443401 000001 111111 222221 333331 440401 001001 112111 223221 330331 441401 002001 113111 220221 331331 442401 003001 110111 221221 332331 443401 000001 111111 222221 333331 440401 001001 112111 223221 330331 441401 002001 113111 220221 331331 442401 003001 110111 221221 332331 443402 000002 111112 222222 333332 440402 001002 112112 223222 330332 441402 002002 113112 220222 331332 442402 003002 110112 221222 332332 443402 000002 111112 222222 333332 440402 001002 112112 223222 330332 441402 002002 113112 220222 331332 442402 003002 110112 221222 332332 443402 000002 111112 222222 333332 440402 001002 112112 223222 330332 554543'.split(' ');

const NAMES: readonly string[] = [
    "150 Iced-Out XR Wallet #001 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #002 — Polygon Edition",
    "150 Iced-Out XR Wallet #003 — Quai Edition",
    "150 Iced-Out XR Wallet #004 — Ethereum Edition",
    "150 Iced-Out XR Wallet #005 — Solana Edition",
    "150 Iced-Out XR Wallet #006 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #007 — Polygon Edition",
    "150 Iced-Out XR Wallet #008 — Quai Edition",
    "150 Iced-Out XR Wallet #009 — Ethereum Edition",
    "150 Iced-Out XR Wallet #010 — Solana Edition",
    "150 Iced-Out XR Wallet #011 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #012 — Polygon Edition",
    "150 Iced-Out XR Wallet #013 — Quai Edition",
    "150 Iced-Out XR Wallet #014 — Ethereum Edition",
    "150 Iced-Out XR Wallet #015 — Solana Edition",
    "150 Iced-Out XR Wallet #016 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #017 — Polygon Edition",
    "150 Iced-Out XR Wallet #018 — Quai Edition",
    "150 Iced-Out XR Wallet #019 — Ethereum Edition",
    "150 Iced-Out XR Wallet #020 — Solana Edition",
    "150 Iced-Out XR Wallet #021 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #022 — Polygon Edition",
    "150 Iced-Out XR Wallet #023 — Quai Edition",
    "150 Iced-Out XR Wallet #024 — Ethereum Edition",
    "150 Iced-Out XR Wallet #025 — Solana Edition",
    "150 Iced-Out XR Wallet #026 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #027 — Polygon Edition",
    "150 Iced-Out XR Wallet #028 — Quai Edition",
    "150 Iced-Out XR Wallet #029 — Ethereum Edition",
    "150 Iced-Out XR Wallet #030 — Solana Edition",
    "150 Iced-Out XR Wallet #031 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #032 — Polygon Edition",
    "150 Iced-Out XR Wallet #033 — Quai Edition",
    "150 Iced-Out XR Wallet #034 — Ethereum Edition",
    "150 Iced-Out XR Wallet #035 — Solana Edition",
    "150 Iced-Out XR Wallet #036 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #037 — Polygon Edition",
    "150 Iced-Out XR Wallet #038 — Quai Edition",
    "150 Iced-Out XR Wallet #039 — Ethereum Edition",
    "150 Iced-Out XR Wallet #040 — Solana Edition",
    "150 Iced-Out XR Wallet #041 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #042 — Polygon Edition",
    "150 Iced-Out XR Wallet #043 — Quai Edition",
    "150 Iced-Out XR Wallet #044 — Ethereum Edition",
    "150 Iced-Out XR Wallet #045 — Solana Edition",
    "150 Iced-Out XR Wallet #046 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #047 — Polygon Edition",
    "150 Iced-Out XR Wallet #048 — Quai Edition",
    "150 Iced-Out XR Wallet #049 — Ethereum Edition",
    "150 Iced-Out XR Wallet #050 — Solana Edition",
    "150 Iced-Out XR Wallet #051 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #052 — Polygon Edition",
    "150 Iced-Out XR Wallet #053 — Quai Edition",
    "150 Iced-Out XR Wallet #054 — Ethereum Edition",
    "150 Iced-Out XR Wallet #055 — Solana Edition",
    "150 Iced-Out XR Wallet #056 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #057 — Polygon Edition",
    "150 Iced-Out XR Wallet #058 — Quai Edition",
    "150 Iced-Out XR Wallet #059 — Ethereum Edition",
    "150 Iced-Out XR Wallet #060 — Solana Edition",
    "150 Iced-Out XR Wallet #061 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #062 — Polygon Edition",
    "150 Iced-Out XR Wallet #063 — Quai Edition",
    "150 Iced-Out XR Wallet #064 — Ethereum Edition",
    "150 Iced-Out XR Wallet #065 — Solana Edition",
    "150 Iced-Out XR Wallet #066 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #067 — Polygon Edition",
    "150 Iced-Out XR Wallet #068 — Quai Edition",
    "150 Iced-Out XR Wallet #069 — Ethereum Edition",
    "150 Iced-Out XR Wallet #070 — Solana Edition",
    "150 Iced-Out XR Wallet #071 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #072 — Polygon Edition",
    "150 Iced-Out XR Wallet #073 — Quai Edition",
    "150 Iced-Out XR Wallet #074 — Ethereum Edition",
    "150 Iced-Out XR Wallet #075 — Solana Edition",
    "150 Iced-Out XR Wallet #076 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #077 — Polygon Edition",
    "150 Iced-Out XR Wallet #078 — Quai Edition",
    "150 Iced-Out XR Wallet #079 — Ethereum Edition",
    "150 Iced-Out XR Wallet #080 — Solana Edition",
    "150 Iced-Out XR Wallet #081 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #082 — Polygon Edition",
    "150 Iced-Out XR Wallet #083 — Quai Edition",
    "150 Iced-Out XR Wallet #084 — Ethereum Edition",
    "150 Iced-Out XR Wallet #085 — Solana Edition",
    "150 Iced-Out XR Wallet #086 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #087 — Polygon Edition",
    "150 Iced-Out XR Wallet #088 — Quai Edition",
    "150 Iced-Out XR Wallet #089 — Ethereum Edition",
    "150 Iced-Out XR Wallet #090 — Solana Edition",
    "150 Iced-Out XR Wallet #091 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #092 — Polygon Edition",
    "150 Iced-Out XR Wallet #093 — Quai Edition",
    "150 Iced-Out XR Wallet #094 — Ethereum Edition",
    "150 Iced-Out XR Wallet #095 — Solana Edition",
    "150 Iced-Out XR Wallet #096 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #097 — Polygon Edition",
    "150 Iced-Out XR Wallet #098 — Quai Edition",
    "150 Iced-Out XR Wallet #099 — Ethereum Edition",
    "150 Iced-Out XR Wallet #100 — Solana Edition",
    "150 Iced-Out XR Wallet #101 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #102 — Polygon Edition",
    "150 Iced-Out XR Wallet #103 — Quai Edition",
    "150 Iced-Out XR Wallet #104 — Ethereum Edition",
    "150 Iced-Out XR Wallet #105 — Solana Edition",
    "150 Iced-Out XR Wallet #106 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #107 — Polygon Edition",
    "150 Iced-Out XR Wallet #108 — Quai Edition",
    "150 Iced-Out XR Wallet #109 — Ethereum Edition",
    "150 Iced-Out XR Wallet #110 — Solana Edition",
    "150 Iced-Out XR Wallet #111 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #112 — Polygon Edition",
    "150 Iced-Out XR Wallet #113 — Quai Edition",
    "150 Iced-Out XR Wallet #114 — Ethereum Edition",
    "150 Iced-Out XR Wallet #115 — Solana Edition",
    "150 Iced-Out XR Wallet #116 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #117 — Polygon Edition",
    "150 Iced-Out XR Wallet #118 — Quai Edition",
    "150 Iced-Out XR Wallet #119 — Ethereum Edition",
    "150 Iced-Out XR Wallet #120 — Solana Edition",
    "150 Iced-Out XR Wallet #121 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #122 — Polygon Edition",
    "150 Iced-Out XR Wallet #123 — Quai Edition",
    "150 Iced-Out XR Wallet #124 — Ethereum Edition",
    "150 Iced-Out XR Wallet #125 — Solana Edition",
    "150 Iced-Out XR Wallet #126 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #127 — Polygon Edition",
    "150 Iced-Out XR Wallet #128 — Quai Edition",
    "150 Iced-Out XR Wallet #129 — Ethereum Edition",
    "150 Iced-Out XR Wallet #130 — Solana Edition",
    "150 Iced-Out XR Wallet #131 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #132 — Polygon Edition",
    "150 Iced-Out XR Wallet #133 — Quai Edition",
    "150 Iced-Out XR Wallet #134 — Ethereum Edition",
    "150 Iced-Out XR Wallet #135 — Solana Edition",
    "150 Iced-Out XR Wallet #136 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #137 — Polygon Edition",
    "150 Iced-Out XR Wallet #138 — Quai Edition",
    "150 Iced-Out XR Wallet #139 — Ethereum Edition",
    "150 Iced-Out XR Wallet #140 — Solana Edition",
    "150 Iced-Out XR Wallet #141 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #142 — Polygon Edition",
    "150 Iced-Out XR Wallet #143 — Quai Edition",
    "150 Iced-Out XR Wallet #144 — Ethereum Edition",
    "150 Iced-Out XR Wallet #145 — Solana Edition",
    "150 Iced-Out XR Wallet #146 — Bitcoin Edition",
    "150 Iced-Out XR Wallet #147 — Polygon Edition",
    "150 Iced-Out XR Wallet #148 — Quai Edition",
    "150 Iced-Out XR Wallet #149 — Ethereum Edition",
    "150 Iced-Out XR Wallet #150 — Dante Obsidian Couture (1-of-1 Masterpiece)"
];

const TITLES: readonly string[] = [
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Solana Obsidian",
    "Bitcoin Sovereign Gold",
    "Polygon Platinum",
    "Quai Rose",
    "Ethereum Carbon",
    "Dante Obsidian Couture"
];

export const EDITION_COUNT = 150;

/** ERC-721 metadata (traits only) for token `id` (1-based). */
export function editionMetadata(id: number): EditionMetadata {
    const code = CODES[id - 1];
    if (!code) throw new Error(`No edition #${id}`);
    return {
        token_id: id,
        name: NAMES[id - 1],
        attributes: TRAIT_NAMES.map((trait_type, k) => ({ trait_type, value: TRAITS[k][parseInt(code[k], 36)] })),
    };
}

export function rarityOf(tier: string): Rarity {
    if (tier.startsWith('Mythic')) return 'Mythic';
    if (tier.startsWith('Legendary')) return 'Legendary';
    if (tier.startsWith('Epic')) return 'Epic';
    return 'Rare';
}

/** Name, title and rarity of edition `id`. */
export function editionInfo(id: number): EditionInfo {
    const code = CODES[id - 1];
    if (!code) throw new Error(`No edition #${id}`);
    return { id, name: NAMES[id - 1], edition: TITLES[id - 1], rarity: rarityOf(TRAITS[5][parseInt(code[5], 36)]) };
}

/** Picker rows: id, display name and rarity. */
export function editionList(): { id: number; name: string; rarity: Rarity }[] {
    return CODES.map((_, i) => {
        const e = editionInfo(i + 1);
        return { id: e.id, name: `#${String(e.id).padStart(3, '0')} · ${e.edition}`, rarity: e.rarity };
    });
}
