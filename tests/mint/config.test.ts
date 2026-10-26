import { describe, expect, test } from 'bun:test';
import { LOCAL_CHAIN, MAINNET, mintChainFor } from '../../lib/mint/config';
import { EDITION_COUNT, editionInfo, editionList, editionMetadata } from '../../lib/mint/editions';

describe('the mint chain', () => {
    test('Ethereum mainnet, always, in a built app', () => {
        expect(MAINNET.chainId).toBe(1);
        expect(mintChainFor({ nodeEnv: 'production' })).toBe(MAINNET);
        expect(mintChainFor({ nodeEnv: 'production', chainId: '31337' })).toBe(MAINNET);
        expect(mintChainFor({ nodeEnv: 'production', chainId: '11155111' })).toBe(MAINNET);
    });
    test('the local Hardhat chain only on a dev server that asks for it', () => {
        expect(mintChainFor({ nodeEnv: 'development', chainId: '31337' })).toBe(LOCAL_CHAIN);
        expect(mintChainFor({ nodeEnv: 'development' })).toBe(MAINNET);
        expect(mintChainFor({ nodeEnv: 'development', chainId: '11155111' })).toBe(MAINNET);
        expect(LOCAL_CHAIN.rpc).toBe('http://127.0.0.1:8545');
    });
});

describe('the public edition index', () => {
    test('150 editions, names and six traits each', () => {
        expect(EDITION_COUNT).toBe(150);
        for (let id = 1; id <= 150; id++) {
            const m = editionMetadata(id);
            expect(m.token_id).toBe(id);
            expect(m.name).toContain(`#${String(id).padStart(3, '0')}`);
            expect(m.attributes).toHaveLength(6);
        }
        expect(() => editionMetadata(151)).toThrow();
    });
    test('titles and rarity for the mint UI', () => {
        expect(editionInfo(150).rarity).toBe('Mythic');
        expect(editionInfo(150).edition).toBe('Dante Obsidian Couture');
        const list = editionList();
        expect(list).toHaveLength(150);
        expect(list[0].name).toBe(`#001 · ${editionInfo(1).edition}`);
    });
});
