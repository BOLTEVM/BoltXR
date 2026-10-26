# Iced-Out XR watches & passthrough

The Wrist OS watch can be any of the **150 Iced-Out XR editions**:
a real-size, gem-set watch that wraps your left wrist in VR and passthrough, works exactly like
the classic Wrist OS watch (crown → menu, HOME / PAY / SWAP / FARM / SCAN), and whose dial is a
live **DeFi desk**.

**Holders only.** A watch can be worn only by a wallet that holds its NFT. Pick it in
**Settings → Wrist watch**: the list shows the editions your holder addresses own on chain
(the vault's own EVM address, plus any wallet linked there by signing a message). Everyone else
keeps the classic Wrist OS watch, and can try every edition on from the home page.
**Calm gems** softens the sparkle and turns off the celebration flashes.

## Minting (home page)

**Try on and mint** opens the mint modal:

* every edition in a velvet studio, on a display arm (porcelain, bronze or onyx), or on your own
  wrist through the camera (MediaPipe Hands, on the device — nothing is recorded or sent);
* a 150-tick price track (one tick per watch, height = price, minted ticks filled, the next one
  lit) and a strip of all 150 studio renders;
* the live sale: phase, minted count, next price, your allowlist pass, your per-wallet allowance;
* minting with a browser wallet (any EIP-6963 wallet — MetaMask, Rabby, Coinbase…) or with the
  Bolt vault itself when it signs for the mint chain. Mints go in order, so the modal says which
  ids you will get. Price protection (on by default) authorises the price as if two more mints
  landed first; the contract refunds whatever was not needed in the same transaction.
* after minting with a browser wallet, **Link wallet** signs a message so this device knows that
  address is yours, and the watch appears in Settings.

Previews are previews: the dial reads PREVIEW · MINT TO UNLOCK, no wallet data reaches it, and
no model file is published (the token metadata has images only).

Chain: **Ethereum mainnet**, and only mainnet. The contract address goes in
**`lib/mint/config.ts`** (or `NEXT_PUBLIC_WATCH_CONTRACT`; `NEXT_PUBLIC_WATCH_RPC` for your own
RPC). Contract, tests and deployment: `contracts/README.md`.

The mint art — each token's studio stills, the gallery thumbnails, the token metadata — is on
Arweave, not in this repository. Set `NEXT_PUBLIC_WATCH_ART_BASE` to the images folder the upload
printed and the mint modal's strip and the landing page load their thumbnails from the permaweb;
unset, they come from `public/watches/thumbs/` on a machine that has them (git-ignored), and are
hidden where they are missing.

## Holders only

Two independent gates decide whether a watch may be worn:

1. **Before it is worn** — `hooks/useWatchOwnership.tsx` reads `tokensOfOwner` for the holder
   addresses from the chain, this session (the answer kept in storage only feeds the Settings
   text; it never puts a watch on a wrist). Only those editions can be worn.
2. **Once it is on** — the watch asks again by itself, every time it is put on (every app load):
   `ownerOf(edition)`, read fresh (`lib/mint/holderCheck.ts`), against holder addresses it gathers
   itself. Until the chain answers, the dial reads VERIFYING · HOLDER CHECK and the crown and menu
   do nothing (OFFLINE · HOLDER NOT VERIFIED if the chain cannot be reached; it keeps trying).

If the second answer is that the wrist does not hold it — the first gate was bypassed — the dial
reads **NOT THE HOLDER · SELF-DESTRUCT** and the watch blows apart in fire and smoke; afterwards
the wrist gets the classic watch back, so the wallet keeps working. Every load, no override: to
wear one while developing, mint it on the local chain (below).

Everything here runs in the user's browser, so someone who rewrites the app's JavaScript can
remove both gates. What must really stay with holders is served by a server: the **3D models**.

## Holder downloads (GLB)

Settings → Wrist watch → **3D models** lists the watches your addresses hold. Download asks the
address that holds the watch — the vault, or the linked browser wallet — to sign a message (it
moves nothing); the holder server checks the signature and `ownerOf` on mainnet, then sends that
watch's GLB. The models are in a private bucket and never public. `NEXT_PUBLIC_WATCH_HOLDER_API`
is the server's URL; unset, the buttons are hidden. Code: `lib/mint/holderDownload.ts` (the
message the holder signs is built here, from this build's contract and chain).

## Using it

| Where | Action | Result |
| --- | --- | --- |
| XR | Look at your left wrist | The watch rides the wrist joint (hand tracking) or the left grip (controllers); 12 o'clock faces away from you, crown toward the hand |
| XR | Look **at the dial** | Raise-to-read: the hands glide aside to 4:40 / 7:20 (like a hybrid smartwatch) so the desk readout is clear; look away and they tell the time again |
| XR / desktop | Tap the **dial** | Pages the desk: portfolio → markets → fees → yield → activity (the hands step aside for a few seconds) |
| XR / desktop | Press the **crown** | Opens / closes the holographic menu (HOME, PAY, SWAP, FARM, SCAN, DESK) floating above the watch |
| Passthrough session | Menu → **VIRTUAL SKY / PASSTHROUGH** | Switches between seeing your room and the virtual sky, without leaving the session |

## The DeFi desk — only real numbers

| Page | Shows | Source |
| --- | --- | --- |
| Portfolio | total value, session sparkline (one point per wallet refresh), allocation ring, the edition's chain value | `useWallet` balances × prices |
| Markets | price of what you hold and its change **since this session started** | `useWallet` prices |
| Fees | the network fee for the edition's chain (Ethereum for SOL / BOLT editions) | `estimateFee` |
| Yield | the highest-APY *lower-risk* pool, preferring the edition's chain, with the Farm panel's guard rails (≥ $10M TVL, ≤ 30 % APY) and "estimate, not a promise" | DeFiLlama scan (`lib/farming`), cached 10 min, fetched only when you open this page |
| Activity | the newest transaction from this device and its status | `history` (refreshed every 20 s on this page) |
| Locked | "VAULT LOCKED · PIN REQUIRED", day/date and small seconds — nothing personal | time only |

Anything unknown reads "—". A transaction turning **confirmed** makes every stone celebrate.

## Passthrough

* **Passthrough** (lobby button) starts an `immersive-ar` session — on Quest 3 / 3S / Pro that is
  the colour passthrough feed. The virtual sky, stars, token rain and floor grid are not drawn,
  so the room shows through; panels, tokens and the watch stay. An invisible arm occluder hides
  the back of the bracelet behind your real forearm.
* The watch menu's **VIRTUAL SKY** button draws an opaque sky dome in the same session (it then
  looks like VR); **PASSTHROUGH** switches back. Flipping inside the session avoids re-requesting
  a session, which needs a fresh user gesture that in-headset input cannot reliably provide.
* **VR** (lobby button) still starts a classic `immersive-vr` session.

Code: `lib/xr/passthrough.ts` (state + blend-mode detection), `lib/xr/session.ts` (the XR store
and both entry paths), `components/xr/VirtualSky.tsx`, `components/Scene.tsx`.

## The watch module (private)

The watches themselves — designs, edition specs, the try-on stage, the worn watch, the
self-destruct, the art and the models — are in a **private repository**, checked out at
`private/iced-out` (git-ignored here). The app imports it as `@iced-out/watch`; its shape is
`lib/iced-out/contract.ts`. `next.config.ts` points the import at `private/iced-out/index.ts` when
that folder exists and at `lib/iced-out/missing.ts` when it does not, and prints which one it
used. Without the module the app still builds and runs: the classic watch on every wrist, the
studio photo instead of the 3D try-on; minting, ownership and holder downloads work as usual.

```powershell
git clone https://github.com/BOLTEVM/0x1501501505150150150150150.git private/iced-out   # with access
$env:ICED_OUT_REQUIRED = "1"; pnpm build      # release builds: fail if the module is missing
```

The gem engine (stone geometry, the gem shader, metals, the studio environment) is shared with the
coins and stays public in `lib/gems/`. The edition index the mint UI reads — names, traits,
titles, rarity — is `lib/mint/editions.ts`, generated by the module from its manifest.

## Testing locally (no real ETH)

```powershell
cd contracts; pnpm chain                                          # terminal 1: Hardhat node, chain 31337
cd contracts; $env:MINT_TO = "0xYourVaultAddress"; pnpm local     # terminal 2: deploy, open the sale, mint #1 to you
# .env.local:  NEXT_PUBLIC_WATCH_CHAIN_ID=31337  and  NEXT_PUBLIC_WATCH_CONTRACT=<printed address>
pnpm dev
```

The local chain is honoured by the dev server only; a built app always reads mainnet.

## Headset checklist (Quest 3)

- [ ] Holder: the watch shows VERIFYING for a moment, then the desk; crown and menu work.
- [ ] Not a holder (simulate a bypass in a dev build: make `wearableEdition` in `lib/mint/ownership.ts` return `chosen`): NOT THE HOLDER, then the explosion; pieces land on the floor; the classic watch returns; reloading does it again. Editing the stored ownership cache must NOT put a watch on the wrist at all.
- [ ] Offline holder: OFFLINE · HOLDER NOT VERIFIED; the watch unlocks once back online.

- [ ] Settings → Wrist watch lists 150 editions and the classic watch; changing it swaps the watch live.
- [ ] Passthrough: room visible, no sky/stars/grid; bracelet hidden behind the real forearm.
- [ ] Menu → VIRTUAL SKY makes the session opaque; PASSTHROUGH brings the room back.
- [ ] Hand tracking: the watch sits on the back of the left wrist and follows without lag or jitter.
- [ ] Controllers: the watch sits behind the left grip; the menu is reachable with the right hand.
- [ ] Tapping the dial pages the desk; locked vault shows no balances.
- [ ] Crown press opens/closes the menu; HOME/PAY/SWAP/FARM/SCAN open the same panels as before.
- [ ] Frame rate holds at 72 Hz with #150 (heaviest edition) on the wrist.
- [ ] Calm gems removes the celebration flashes.
