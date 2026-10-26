/** lib/coins — the Currencychips coins: catalog, holdings selection, the living 3D coin. */
export { COINS, COIN_ORDER, coinFor, type CoinSpec, type HaloStyle } from './catalog';
export { selectHoldings, arcSlots, assetKey, isPositiveAmount, type Holding, type HoldingsView, type WalletAsset, type Slot } from './holdings';
export { CoinModel, disposeCoinCache, prewarmCoin, type CoinQuality, type CoinModelOptions } from './CoinModel';
