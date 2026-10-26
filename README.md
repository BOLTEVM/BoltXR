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

### Opening the dev server on a Meta Quest
`http://localhost:3000` typed into the Quest browser points at the headset itself, not your PC,
so the page never loads. WebXR also needs a secure page (`https://`, or `http://localhost`), so the
PC's plain `http://192.168.x.x:3000` loads without VR. Use one of these:

**USB cable (simplest, no certificate).** Turn on developer mode for the headset (Meta Horizon app →
Devices → Developer mode), plug it in, accept *Allow USB debugging* inside the headset, and have
`adb` on PATH (Android Platform Tools or Meta Quest Developer Hub). Then:
```powershell
adb devices          # the headset should be listed as "device"
pnpm dev:quest:usb   # runs adb reverse tcp:3000 tcp:3000, then the dev server
```
Open `http://localhost:3000` in the Quest browser. Run `pnpm dev:quest:usb` again after re-plugging.

**Wi-Fi.** Headset and PC on the same network:
```powershell
pnpm dev:quest       # HTTPS on all interfaces; prints https://<PC address>:3000
```
Open the printed `https://…:3000` address on the Quest, choose *Advanced → Proceed* on the
certificate warning (the dev certificate is self-signed), and allow Node.js on **Private networks**
if Windows Firewall asks. `next.config.ts` lists this PC's addresses in `allowedDevOrigins`, which
Next 16 needs before it serves dev scripts to another device; restart the dev server after changing
networks. If the page still does not load, check the Wi-Fi is set to Private in Windows, not Public.

### Iced-Out XR watches (private module)
The 150 Iced-Out XR watches — the NFT watches holders wear on the wrist — are minted on
**Ethereum mainnet** and built from a **private repository**, not this one. With access, check it
out inside the wallet; the folder is git-ignored here:

```bash
git clone https://github.com/BOLTEVM/0x1501501505150150150150150.git private/iced-out
pnpm dev      # prints "Iced-Out XR watches: private module included"
```

Without it the wallet builds and runs the same, minus the watches: the classic Wrist OS watch
on every wrist and studio photos instead of the 3D try-on (minting and holder downloads still
work). Release builds should set `ICED_OUT_REQUIRED=1` so a missing checkout fails the build. The
contract and its Hardhat tests and local chain are in `contracts/`; the details are in
`docs/iced-watches.md`.

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
WebCrypto and camera access work), runs sandboxed with context isolation, and opens wallet-external
links in your default browser. Sensitive page permissions are denied unless explicitly allowed below.

## 🛡️ Bolt Shield Chromium browser

The Windows, macOS, and Linux desktop shell includes up to **12 Chromium tabs**, each with its own
sandboxed renderer, persistent storage partition, navigation history, shield settings, and pending
wallet requests. Open **WEB** in the spatial interface or **Play on BEAM** on the home screen. The
spatial panel renders live Chromium captures and supports normalized tap/click, scrolling, tab
switching, a spatial URL keyboard, and shield controls. New-window requests become isolated tabs.

**Bolt Shield** blocks known third-party tracker hosts and strips cross-site `Cookie` and
`Set-Cookie` headers by default. First-party cookies remain functional. Each tab has tracker and
third-party-cookie switches, block/request counters, and a clear-site-data action; closing a tab also
clears its site data. These are focused network protections, not a complete anti-fingerprinting or
safe-browsing system. A malicious site can still be deceptive, so verify origins and approval details.

Pages see Bolt XR as a Quai wallet through a Pelagus-compatible `window.pelagus` (alias `window.quai`)
supporting `quai_requestAccounts`, `quai_accounts`, `quai_chainId`, `personal_sign`,
`quai_sendTransaction`, `quai_signTypedData_v4`, and `wallet_switchEthereumChain`. BEAM's Connect,
Verify, and Keyforge **Claim METAKEY** flows work unchanged.

**Wrist signing and isolation**

- Private keys stay in the trusted wallet window. Requests are bound to the top-level page origin;
  embedded frames get no provider. Connect, message, typed-data, transaction, and network approvals
  appear in the wallet and above the wristwatch. Transactions show origin, chain, destination,
  value, calldata, and risk context, with an arming delay against accidental double approval.
- An active game XR session is ended before a wallet approval. The page is hidden while approval is
  shown, Enter never approves, and a locked vault requires the PIN first.
- Sign-in messages for another domain are flagged. Raw `eth_sign`/`quai_sign`, offline transaction
  signing, and page-initiated contract deployment are refused. Read-only calls use the selected Quai
  node. Locking and disconnecting immediately update connected pages.
- Pages may use fullscreen, pointer lock, sanitized clipboard write, and WebXR permissions. Camera,
  microphone, location, notifications, USB/HID, keyboard lock, and downloads are refused. Escape
  remains available even if a page tries to trap fullscreen. Only `https://` pages, or `http://` on
  this machine, can be opened; privileged schemes such as `file:` and `app:` are blocked.
- Key presses and clicks count as activity so the vault does not auto-lock mid-game. Page-generated
  wallet requests do not count as activity.

**WebXR games.** Chromium is started with WebXR and WebXR incubation features enabled. Actual
immersive sessions require a working OpenXR/platform runtime, a compatible headset and controllers,
and a game that supports the device. The automated suite verifies `navigator.xr` and
`requestSession`; it does not certify physical-headset gameplay, performance, or comfort.

The regular web/headset build cannot embed a privileged multi-tab Chromium browser inside another
web page. It shows an explicit desktop-shell fallback instead of pretending that remote tabs or
native wallet signing are active.

**Linking a Quai wallet.** Bolt XR derives Quai accounts exactly like Pelagus (coin type 994,
account 0, indices ground into Cyprus-1), so restoring a Pelagus recovery phrase shows the same
address. Quai chain id 9 (mainnet) / 15000 (Orchard), balance, send, and history are supported.

**Local playtest.** Run BEAM with `pnpm playtest:local` and open **BEAM (local playtest)**
(`http://localhost:5280`). Pick **Orchard Testnet** in the browser bar if your BEAM build uses
`VITE_QUAI_NETWORK=orchard`.

**Tests**

```bash
pnpm test:browser            # navigation, provider, tracker, and cookie-policy rules
pnpm build && pnpm test:e2e  # 64 real-Electron checks, including offscreen spatial input and signed Quai transactions
```

`test:e2e` expects the BEAM repo next to this folder (`../beam`, or set `BEAM_DIR`). It uses a
throwaway profile, never your vault, and verifies live Chromium capture/input, tab separation,
first-party and cross-site cookie behavior, WebXR API exposure, permissions, approvals, and actual
transaction broadcast/receipt against a verifying mock node. On a Linux server, wrap it in
`xvfb-run -a`.

## 📜 Security & Distribution
- **Audit Status**: No independent production security audit has been completed. Validate real transactions and device behavior before handling significant funds.
- **Spatial Validation**: Run `node scripts/verify-wrist-os.mjs` for the desktop interaction and deterministic QR-camera smoke test. Live pool data requires network access. On-device headset validation remains a separate release gate.
- **Asset Optimization**: Geometry, pixel ratio, lighting, and tone mapping are bounded for XR; frame rate must be measured on the target headset.

---
Built with ❤️ by the **BOLT XR** Team.
