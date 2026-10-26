# 3D Diamond & Gold Studded Crypto Coins Suite (`Currencychips/`)

This directory contains the production-grade concept artwork, 8K prompts, B3JS Markdown Prompt Documents (`*.mpd.md`), and Photo Forge quality metrics for the **3D Diamond and Gold Studded Crypto Coins** designed to replace the legacy flat primitive chips in the **Handtracking Wallet XR Window**.

---

## 1. Crypto Coin Roster & Horological Specifications

| Asset ID | Symbol | Network | Base Metal & Gem Setting | PG-04 Std | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| [`coin_eth_diamond_gold`](./coin_eth_diamond_gold.jpg) | **ETH** | Ethereum | 24K Gold & Platinum, Sapphire & Diamond Pavé | `0.18+` | **CERTIFIED** |
| [`coin_btc_diamond_gold`](./coin_btc_diamond_gold.jpg) | **BTC** | Bitcoin | 24K Sovereign Gold, Canary & Baguette Diamonds | `0.18+` | **CERTIFIED** |
| [`coin_quai_diamond_gold`](./coin_quai_diamond_gold.jpg) | **QUAI** | Quai Network | 18K Rose Gold, Pigeon-Blood Rubies & Diamonds | `0.18+` | **CERTIFIED** |
| [`coin_pol_diamond_gold`](./coin_pol_diamond_gold.jpg) | **POL** | Polygon | 18K White Gold, Royal Amethysts & Platinum | `0.18+` | **CERTIFIED** |
| [`coin_bnb_diamond_gold`](./coin_bnb_diamond_gold.jpg) | **BNB** | BNB Chain | 24K Imperial Gold, Canary & Black Diamonds | `0.18+` | **CERTIFIED** |
| [`coin_mon_diamond_gold`](./coin_mon_diamond_gold.jpg) | **MON** | Monad | 24K Gold & Violet Titanium, Tanzanites | `0.18+` | **CERTIFIED** |
| [`coin_sui_diamond_gold`](./coin_sui_diamond_gold.jpg) | **SUI** | Sui Network | 950 Platinum, Aquamarine & Diamond Orbital Ring | `0.18+` | **CERTIFIED** |
| [`coin_trx_diamond_gold`](./coin_trx_diamond_gold.jpg) | **TRX** | Tron | 24K Gold, Baguette Crimson Rubies & Diamonds | `0.18+` | **CERTIFIED** |
| [`coin_boltevm_diamond_gold`](./coin_boltevm_diamond_gold.jpg) | **BOLT** | BOLTEVM Layer-1 | 24K Gold & Platinum, Cyan Enamel & Baguette VVS | `0.18+` | **CERTIFIED** |
| [`coin_sol_diamond_gold`](./coin_sol_diamond_gold.jpg) | **SOL** | Solana | 18K Gold & Forged Carbon, Colombian Emeralds | `0.18+` | **CERTIFIED** |

---

## 2. In the wallet

These designs are built as real-time 3D coins in `lib/coins/` and stand in the XR scene in
place of the old chips: one coin per asset the wallet holds, none for zero balances. How
they are sculpted, textured, animated and post-processed, and how holdings decide what
appears, is in [`docs/currency-coins.md`](../docs/currency-coins.md).

The coin faces carry the ticker, the engraved network name and original emblems (a sapphire
prism for ETH, the ₿ sign, a braided knot, a vortex, a pear-cut stone, a sun, a lightning
bolt), not redrawings of the networks' official logos. A logo you have the right to use can
be sculpted onto any coin through its `emblem.svgPath`.

`renders3d/` holds stills and reels rendered from that code (not from the concept images
above).
