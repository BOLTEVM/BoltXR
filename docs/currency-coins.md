# Currency coins (Currencychips in the XR wallet)

The coins that stand in front of you when you enter Bolt XR are built from the
`Currencychips/` designs: one sculpted, gem-set, animated coin per asset your
wallet actually holds. They replace the flat cylinder chips, which showed
every supported chain whether you held it or not.

## What shows up

`lib/coins/holdings.ts` → `selectHoldings(tokens)` decides:

| Wallet state for an asset | In the scene |
| --- | --- |
| Balance read and above zero | Its coin |
| Balance read and zero | Nothing |
| First read still in flight | Nothing yet ("Reading your balances…" while no coin is up) |
| Network never answered | Nothing, and the network is named ("Can't reach Sui right now…") |
| Answered before, failing now | The coin stays with the last balance read, halo red, labelled OFFLINE |
| Vault locked | Nothing (the dashboard asks to unlock) |
| Every network answered, nothing held | "No coins yet" with a Receive button |

Amounts are compared as decimal strings, so even dust counts as held. The
largest USD position stands in the middle and the rest alternate outwards
(`arcSlots`); coins are sized 0.85–1.25× by their share of the portfolio.

## Interaction (desktop mouse, XR rays and hands)

- **Point at a coin**: it turns to face you, grows, its stones run a chase
  pattern, its halo brightens and a flare crosses it. The label switches to the
  network name.
- **Tap / click / pinch**: opens that asset's transaction panel (send, receive,
  swap), exactly as the chips did.
- **Balance goes up**: sparks off the rim and the stones celebrate. **Down**: a
  dip.
- **Asset sold off**: the coin shrinks away and unmounts.
- **Settings → calm** (the watch's calm setting): softer sparkle, no idle flips,
  no strobing.

Only an invisible disc per coin is ray-tested, never the stones, so pointing
stays cheap.

## The coins

`lib/coins/catalog.ts` holds one spec per coin in `Currencychips/manifest.json`:

| Coin | Metals | Bezel | Emblem | Halo |
| --- | --- | --- | --- | --- |
| ETH | yellow gold, platinum, stepped tier | two rows of diamond pavé + inner tier row | floating faceted sapphire prism in a platinum frame | data ticks |
| BTC | yellow gold | radial diamond baguettes | ₿ sign, canary pavé | scrolling hash blocks |
| QUAI | rose gold | rubies alternating with diamonds | braided trefoil knot round a ruby cabochon | crimson shards |
| POL | white gold, gunmetal field | radial amethyst baguettes | hexagonal amethyst in a platinum cup, glowing inlay ring | ZK dot matrix |
| BNB | yellow gold, frosted guilloché | canary alternating with black diamonds | BNB monogram in diamond pavé | hex segments |
| MON | yellow gold, violet titanium | diamond pavé with tanzanite accents | platinum vortex round a tanzanite | particle stream |
| SUI | platinum | diamond pavé | pear-cut aquamarine; a diamond-set orbit ring round the coin | (the orbit ring) |
| TRX | yellow gold | ruby and diamond baguette channel | TRX monogram | data ticks |
| SOL | yellow gold, forged carbon | emerald and amethyst emerald-cuts | gold sunburst round an emerald, glowing inlay ring | data ticks |
| BOLT | yellow gold, platinum | radial diamond baguettes | lightning bolt in cyan enamel, platinum frame | lightning |

The wallet currently tracks ETH, QUAI, POL, BNB, MON, BTC, SUI and TRX, so
those eight can appear today. SOL and BOLT are ready for when those chains are
added (`chainKeys` `solana` / `boltevm`). Any other asset (a new chain, an
ERC-20) gets a generated coin from its ticker and colour, so nothing ever
appears blank.

### About logos

The faces carry the ticker, the network name engraved round the field, and
original emblems (a gem, a knot, a vortex, a sun…), not redrawings of each
network's official logo. To use a network's own logo on a coin, put its SVG
path data (from the network's brand kit, under its usage terms) in that coin's
`emblem.svgPath`. It is sculpted the same way, as a bevelled relief.

## How a coin is made (`lib/coins`)

- **Sculpt** (`coinGeometry.ts`, `emblems.ts`, `sdf2d.ts`, `glyphs.ts`): the body
  is a radial sweep of a profile (recessed field, bead or raised tier, stone
  seat, rounded lip, edge). Emblems and lettering are 2D signed distance fields
  traced with marching squares into bevelled extrusions. Stones are the watch
  cuts (brilliant, baguette, emerald, cabochon) plus pear, hexagon and the
  bipyramid prism.
- **Texture** (`coinTextures.ts`): each face is painted as a height field in
  plain JavaScript (no canvas, fonts or downloads): the pattern, the legend
  engraved round the field, and a polished moat round the emblem. It becomes an
  albedo map, a 5×5 Sobel normal map, and a packed occlusion/roughness map.
- **Post-process**: baked into the maps (cavity occlusion, the emblem's soft
  contact shadow, a contrast curve, a vignette into the rim, bloomed glow
  inlays) and carried in the materials (holographic halo, glow billboard,
  hover flare, spark bursts, the stones' fire and glints). WebXR renders straight
  to the headset, where screen-space post-processing is not available, so all
  of it lives in the coins' own shaders and looks the same in the headset and
  on the desktop.
- **Animate** (`CoinModel.ts`): drop-in with a spin, bounce and sparks; idle sway,
  bob and an occasional flip that shows the engraved reverse; emblem motion
  (the prism turns, the vortex and sun spin, the pear rocks, the bolt
  flickers); hover; pulse; stale wobble; exit.
- **Stones**: the Iced-Out watch gem shader (reflection, per-channel fire,
  scintillation, dance patterns, star glints), instanced: a few draws per coin.

### Cost

About 25–30k triangles and ~16 draws per coin at headset quality; eight coins
take ~130 draws. Geometry and textures are built once per coin per session and
cached (`disposeCoinCache()` frees them). Face textures (384 px in the headset)
bake on the main thread in short steps, one coin at a time, while the coin
drops in. They yield with `setTimeout` because `requestAnimationFrame` pauses
during an immersive session.

## Files

- `lib/coins/`: catalog, holdings, sdf2d, glyphs, coinGeometry, emblems, coinTextures,
  coinGems, coinFx, CoinModel, index
- `components/Token3D.tsx`: one coin in the scene (replaces the chip)
- `components/xr/CoinVault.tsx`: the holdings-driven arc, empty and loading states
- `components/Scene.tsx`: mounts the vault where the chips were; the rain
  environment uses the colours of the coins you hold
- `tests/coins/coins.test.ts`: `bun test tests/coins`
- `Currencychips/renders3d/`: stills and reels rendered from this code

## Adding a coin

Add a spec to `COINS` with the chain key(s) it represents. Pick metals from
`COIN_METALS`, stones from `COIN_GEMS`, a bezel setting, an emblem kind, a
field pattern and a halo style. Run `bun test tests/coins`: the catalog test
checks every chain in `SELECTED_CHAINS` has a designed coin.
