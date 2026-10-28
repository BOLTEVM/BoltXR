// Fallback typing for `@iced-out/watch` when private/iced-out is not checked out. The bundlers
// alias the import to lib/iced-out/missing.ts in that case (see next.config.ts); TypeScript only
// uses this ambient declaration when the tsconfig path to the private module does not resolve.
declare module '@iced-out/watch' {
    export const ICED_OUT: import('../lib/iced-out/contract').IcedOutModule;
}
