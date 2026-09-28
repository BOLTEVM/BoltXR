declare module 'troika-three-text' {
  export function configureTextBuilder(config: {
    defaultFontURL?: string | null;
    unicodeFontsURL?: string | null;
    sdfGlyphSize?: number;
    sdfExponent?: number;
    sdfMargin?: number;
    textureWidth?: number;
    useWorker?: boolean;
  }): void;
}
