import { describe, expect, test } from 'bun:test';
import { artBaseFrom } from '../../lib/mint/config';
import { thumbUrl } from '../../components/mint/rarity';

const TX = 'i'.repeat(43);

describe('mint art from the permaweb', () => {
    test('the app takes only an https gateway folder as its art base', () => {
        expect(artBaseFrom(undefined)).toBe('');
        expect(artBaseFrom('ar://abc/')).toBe('');
        expect(artBaseFrom('http://arweave.net/abc/')).toBe('');
        expect(artBaseFrom(`https://arweave.net/${TX}`)).toBe(`https://arweave.net/${TX}/`);
    });
    test('thumbnails come from the permaweb when the art base is set', () => {
        expect(thumbUrl(7, '')).toBe('/watches/thumbs/watch_007.jpg');
        expect(thumbUrl(150, `https://arweave.net/${TX}/`)).toBe(`https://arweave.net/${TX}/thumbs/watch_150.jpg`);
    });
});
