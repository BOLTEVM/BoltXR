/**
 * lib/iced-out/missing.ts — `@iced-out/watch` in a build without the private watch module.
 *
 * Nobody wears an Iced-Out watch in such a build (the classic Wrist OS watch stays on every
 * wrist) and the mint modal shows each edition's studio photo instead of the 3D try-on. The
 * mint itself, ownership, Settings and holder downloads work as usual.
 */

import { IcedOutUnavailableError, type IcedOutModule } from './contract';

export const ICED_OUT: IcedOutModule = {
    available: false,
    IcedWristWatch: null,
    createWatchStage() {
        throw new IcedOutUnavailableError();
    },
};
