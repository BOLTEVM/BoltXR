# BOLT XR | Spatial Finance Wallet

![BOLT XR Logo](./public/logo.png)

**BOLT XR** is a premium, immersive Web3 wallet platform designed for the next generation of spatial computing (VR/AR/XR). Built with Next.js, Three.js, and @react-three/xr, BOLT provides a "handtracking-first" experience for managing assets across multiple chains including Ethereum, Tron, and XRPL EVM.

## 🚀 Key Features

### 1. Immersive 3D Interface
- **Spatial Dashboard**: A floating glassmorphic dashboard for balance tracking and connection management.
- **High-Fidelity 3D Coins**: Real-time rendered metallic tokens with dynamic logo mapping and physics-inspired movement.
- **Interactive Swap Scale**: A procedural 3D balancing scale for token exchanges. Drag and drop tokens onto the scale to initiate swaps with real-world price data.

### 2. Advanced Security
- **3D Security PIN Pad**: A fully immersive, in-scene authentication system. No desktop prompts or popups—unlock your vault directly in XR.
- **Hardened Logic**: Anti-brute force mechanisms, 30-second lockouts after failed attempts, and physics-based "shake" feedback.
- **Local Vault Substrate**: BIP39 mnemonic management with AES-GCM encryption stored securely in local storage.

### 3. Dynamic Environments
- **Landscape Selector**: Switch between multiple immersive scenarios including:
  - **Deep Space**: The ultimate cosmic void.
  - **Neon Sunset**: Retro-future aesthetics.
  - **Zen Garden**: Minimalist green space.
  - **Token Rain**: A spectacular scenario where your assets literally fall from the sky.

### 4. Cross-Chain Support
- **Multi-Chain Aggregation**: Native support for Ethereum, Polygon, BSC, Tron (TRX), Monad, and XRPL EVM.
- **Real-Time Valuations**: Integrated with Pyth Hermes API for sub-second price updates.

## 🛠️ Technology Stack
- **Framework**: Next.js 16 (Turbopack)
- **3D Engine**: Three.js / React Three Fiber
- **XR**: @react-three/xr v6
- **Styling**: Tailwind CSS 4
- **Animation**: Framer Motion
- **Wallet Core**: Custom BOLT substrate (ethers.js)

## 📦 Getting Started

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```

### Production Build
```bash
npm run build
```

## 📜 Distribution Guidelines
- **Asset Optimization**: All logos and textures are optimized for WebGL.
- **Security**: Never share your mnemonic or PIN. The vault is encrypted locally and never touches external servers.

---
Built with ❤️ by the BOLT XR Team.
