<div align="center">
  <img src="./public/0logov3.png" alt="BOLT XR Logo" width="120" />
  <h1>BOLT XR | Spatial Finance Terminal</h1>
  <p><strong>BOLT XR</strong> is a professional-grade, immersive multi-chain wallet platform architected for the future of spatial computing (VR/AR/XR).</p>
</div>

## 🚀 Key Features

### 1. Expert Multi-Chain Architecture
- **Native Non-EVM Support**: Native integration for **Quai (Cyprus-1, Pelagus-compatible)**, **Bitcoin (BIP84 SegWit)**, **Sui (Ed25519)**, and **Tron (Base58Check)**.
- **Stateless Logic Engine**: A hardened, stateless core substrate that eliminates race conditions during concurrent multi-chain operations.
- **BIP39/BIP44 Standard**: Industrial-strength mnemonic management with standardized derivation paths for cross-wallet compatibility.

### 2. Immersive Spatial UI/UX
- **Toggleable Wrist OS**: A sculpted titanium/ceramic-style wrist watch follows the left hand or XR controller. The crown opens the interface; Home, Pay, Swap, Farm, and Scan controls are also available as keyboard-accessible desktop shortcuts.
- **Focused XR Workflows**: Swap and transfer panels move in front of the HMD while in use. Receive generates a chain-aware address QR; copy and paste controls, explicit send review, and QR-to-send handoff reduce address retyping.
- **Live Yield Radar**: Farm scans DeFiLlama pools, filters by TVL, APY, and stablecoin exposure, and presents risk heuristics plus base/reward APY. Projection bars illustrate daily compounding for a selected amount and term; they are estimates, not guaranteed returns or financial advice.
- **Camera-Aware QR Scanner**: EIP-681, BIP-21, and plain wallet addresses are validated before entering the send flow. Camera tracks stop when scanning closes, and permission, unavailable-camera, and frame-timeout states offer a paste fallback.
- **Dynamic Telemetry**: Chain-specific transaction data including Bitcoin fee density (sats/vB), Sui gas estimation, and EVM gas prices.

Camera availability depends on the headset browser, WebXR implementation, and user permission. Desktop browser tests do not replace on-device HMD camera, hand-tracking, controller, comfort, or performance validation.

### 3. Hardened Security
- **Immersive PIN Pad**: A fully sandboxed, in-scene authentication system with anti-brute force lockouts and haptic feedback.
- **Local Vault Substrate**: AES-GCM encrypted local storage vault. Private keys never leave the spatial environment.
- **Secure Info Panel**: Mnemonic phrases are displayed via a gaze-activated 3D panel to prevent shoulder surfing and browser-level sniffing.

### 4. High-Performance Connectivity
- **Hybrid RPC Engine**: Intelligent provider caching and fallback mechanisms using standard JSON-RPC and REST aggregators (Blockstream, Sui Fullnodes).
- **Sub-Second Valuations**: Real-time asset pricing via Pyth Hermes API.

## 🛠️ Technology Stack
- **Frontend**: Next.js 16 (App Router)
- **3D Logic**: Three.js / React Three Fiber / @react-three/drei
- **Spatial**: @react-three/xr v6
- **Cryptography**: ethers.js, bitcoinjs-lib, @mysten/sui, bip39
- **Styling**: Tailwind CSS 4

## 📦 Installation & Setup

### Requirements
- Node.js 20+
- WebXR compatible browser or headset (Meta Quest 3, Apple Vision Pro, etc.)

### Quick Start
```bash
# Install dependencies (including non-EVM libraries)
pnpm install

# Start the development server (http://localhost:3000)
pnpm dev
```

`dev` and `build` first copy the MediaPipe hand-tracking model and runtime from
`node_modules` into `public/vendor/` (see `scripts/copy-vendor-assets.mjs`), so hand
tracking is served by the app itself — no CDN at runtime, and it works offline.

### Desktop XR Emulation
For local desktop testing without a headset, enable Meta IWER through a local-only environment file:

```bash
NEXT_PUBLIC_ENABLE_XR_EMULATION=true
```

Keep this in `.env.local`; `.env*` files are ignored so the flag is not distributed. The app installs the emulated Meta Quest 3 WebXR runtime only when native `navigator.xr` is unavailable. To explicitly override native WebXR during debugging, add:

```bash
NEXT_PUBLIC_FORCE_XR_EMULATION=true
```

Do not enable either flag for production, Electron release builds, or headset validation builds.

### Desktop App (Electron)
```bash
# Develop: Next dev server + Electron window
pnpm electron:dev

# Preview the production export in Electron without packaging
pnpm electron:preview

# Build installers (Windows portable, macOS dmg, Linux AppImage) into dist/
pnpm electron:build
```

The desktop app serves the static export from a private `app://bolt` origin (so assets,
WebCrypto and camera access work), runs sandboxed with context isolation, opens external
links in your default browser, and only grants camera and clipboard permissions.

## 🎮 Play on BEAM (game browser)

The desktop app has a built-in browser for BEAM games, starting with **Overworld Overdrive**
(`https://beam.boltevm.com/play/nft-1`). Open it with **Play on BEAM** on the home screen, the
gamepad button in the Hand Tracking HUD, or the button in the XR panel.

Pages in the browser see Bolt XR as a Quai wallet: it injects a Pelagus-compatible
`window.pelagus` (alias `window.quai`) speaking `quai_requestAccounts`, `quai_accounts`,
`quai_chainId`, `personal_sign`, `quai_sendTransaction`, `quai_signTypedData_v4` and
`wallet_switchEthereumChain`. BEAM's Connect, Verify (sign-in) and Keyforge **Claim METAKEY** work
unchanged.

**Linking a Quai wallet.** Bolt XR derives Quai accounts exactly like Pelagus (coin type 994,
account 0, indices ground into Cyprus-1), so restoring a Pelagus recovery phrase shows the same
address. Quai is now a real chain in the wallet too: chain id 9 (mainnet) / 15000 (Orchard), balance,
send and history. Earlier builds listed Quai as chain 969 on the wrong derivation path with sending
disabled.

**How it is isolated**

- The browser is a separate, sandboxed renderer process with its own storage partition
  (`persist:boltxr-game-browser`); keys stay in the wallet window.
- Requests are attributed to the origin Electron reports for the top-level frame. Embedded frames
  (the game iframe) get no provider.
- Connecting, signing, sending and switching networks open an approval sheet in the wallet. The page
  is hidden while it is shown. A request that arrives while the vault is locked asks for the PIN
  first. Enter never approves.
- Sign-in messages for a different domain than the requesting site are flagged.
  `eth_sign`/`quai_sign` and transaction signing without sending are refused. Contract deployment
  from a page is refused.
- Read-only `quai_*` calls are proxied to the selected Cyprus-1 node.
- Locking sends `accountsChanged([])` to connected sites, and unlocking sends the account back.
  Connected sites can be disconnected on the browser home screen.
- Pages may use fullscreen, pointer lock and keyboard lock (for games). Camera, microphone,
  location, notifications, USB/HID and downloads are refused. New windows open in your system
  browser. Only `https://` pages, or `http://` on this machine, can be opened.
- Key presses and clicks in the game count as activity, so the vault doesn't auto-lock mid-game.
  Requests from the page do not count as activity.

The web and headset builds have no game browser (BEAM can't be framed); they explain this and link the
desktop app.

**Local playtest.** Run BEAM with `pnpm playtest:local` and open **BEAM (local playtest)**
(`http://localhost:5280`). Pick **Orchard Testnet** in the browser bar if your BEAM build uses
`VITE_QUAI_NETWORK=orchard`.

**Tests**

```bash
pnpm test:browser            # URL and method rules
pnpm build && pnpm test:e2e  # real Electron app + BEAM's own wallet code + a verifying mock Quai node
```

`test:e2e` expects the BEAM repo next to this folder (`../beam`, or set `BEAM_DIR`). It uses a
throwaway profile, never your vault. On a Linux server, wrap it in `xvfb-run -a`.

## 📜 Security & Distribution
- **Audit Status**: No independent production security audit has been completed. Validate real transactions and device behavior before handling significant funds.
- **Spatial Validation**: Run `node scripts/verify-wrist-os.mjs` for the desktop interaction and deterministic QR-camera smoke test. Live pool data requires network access. On-device headset validation remains a separate release gate.
- **Asset Optimization**: Geometry, pixel ratio, lighting, and tone mapping are bounded for XR; frame rate must be measured on the target headset.

---
Built with ❤️ by the **BOLT XR** Team.
