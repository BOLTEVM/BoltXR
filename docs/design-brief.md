# Bolt XR Wrist OS — Design Brief

## Concept
A calm, precision-machined spatial wallet that feels like a professional instrument on the wrist, not a collection of floating demo panels. The default desktop composition presents the same watch face and controls that follow the left hand in WebXR.

## Requirements checklist
- Replace the freestanding Swap Scale with a toggleable sculpted 3D wrist watch.
- Keep the existing reviewed, quote-refreshing cross-chain swap flow, launched from the watch.
- Add live yield-opportunity scanning with explicit data freshness, TVL, chain, protocol, reward/base APY, and risk signals.
- Add farming visualizers: sortable opportunities, projected reward curves, scenario amount/term controls, and clear non-guarantee labeling.
- Make sending and receiving available directly from the watch with large copy, paste, QR, and scan actions.
- Validate scanned addresses for the selected network and require the existing transaction review before signing.
- Support mouse, XR controller, and hand input through the same accessible 3D controls.
- Provide a keyboard-accessible desktop QR scanner; use camera scanning on HMDs only where the browser exposes camera frames, and explain unsupported hardware honestly.
- Preserve vault lock/setup, contract tools, token details, and environment selection.
- Maintain a production build, no fabricated balances/APY/positions, bounded geometry, named materials, and useful error/empty/offline states.

## Reference feature → approach
| Product-design feature | Bolt XR implementation |
| --- | --- |
| Machined premium wearable | Layered beveled titanium case, separate bezel, crown, guards, lugs, and articulated strap links |
| High-contrast watch complications | Five large watch tabs: Home, Pay, Swap, Farm, Scan; one focused task at a time |
| Restrained instrument lighting | Cool cyan active state, violet secondary state, emerald value accents, amber risk only |
| Legibility at arm's length | Large labels, short values, generous hit targets, no dense paragraphs on the watch |
| Skeuomorphic physical feedback | Crown rotation, hover lift, emissive active ring, subtle opening/breathing motion |
| Trustworthy financial UI | Live source attribution and timestamps; risk flags and review gates before irreversible actions |

## Scale and layout
Desktop watch assembly: approximately 1.7 m wide in scene units for readability, physically proportioned as a watch with a 1.45:1.7 face-to-case ratio. In an immersive session it scales to a 62 mm-wide wearable and is positioned from the left hand/controller pose. Expanded task panels remain comfortably in front of the user rather than intersecting the wrist.

Desktop: watch at left-center; selected task at right-center; dashboard recedes above. HMD: compact watch at wrist; expanded panel appears 0.42 m ahead at a readable scale.

## Palette and materials
| Part | Color | Roughness | Metalness | Detail |
| --- | --- | --- | --- | --- |
| Watch · Titanium | #64748B | 0.27 | 0.92 | Beveled layered geometry |
| Watch · Dark ceramic | #111827 | 0.18 | 0.5 | Separate bezel and caseback |
| Watch · Sapphire | #93C5FD | 0.08 | 0.05 | Thin clearcoat surface; no expensive transmission |
| Watch · Strap elastomer | #1E293B | 0.72 | 0.05 | Articulated rounded links and grooves |
| UI · Obsidian | #07111F | 0.32 | 0.35 | Opaque high-contrast panel |
| UI · Active cyan | #22D3EE | 0.25 | 0.25 | Emissive accent, restrained intensity |
| UI · Yield emerald | #34D399 | 0.3 | 0.2 | Positive values only, never a safety claim |

## Lighting and atmosphere
Retain the procedural local reflection environment for offline reliability. Add a soft directional key and cool rim, avoid point-light shadow cost, and keep emissive intensities below clipping. No remote HDR or model dependency.

## Main views
1. Desktop default: closed watch with Home complications and visible strap/crown.
2. Desktop Pay: receive QR plus copy and scan actions.
3. Desktop Farm: scanner cards and selected-pool yield projection.
4. Desktop Send: paste/scan recipient and existing review flow.
5. XR wrist: compact anchored watch and expanded task panel.

## Interaction and UI
- Watch crown or Home button toggles the expanded interface.
- Tab labels: HOME, PAY, SWAP, FARM, SCAN.
- PAY provides network selection, QR receive, copy address, paste recipient, and send.
- SCAN requests the camera only after a deliberate action; decoded payloads are validated before continuing.
- Farm scanner defaults to minimum $1m TVL and maximum 30% total APY to reduce noisy/extreme results; users can adjust filters.
- Yield projections use daily compounding of total APY as an illustrative scenario, never a promise or position tracker.

## Editable items
This is an existing React/WebXR product, not an Edit3D asset project. Runtime controls cover watch visibility, tabs, environment, network, farming filters, amount, and projection term. Materials are named for inspection and reuse.

## Performance budget
Keep the watch under 120 meshes, avoid shadow-casting point lights, use shared materials, no post-processing, no per-frame geometry allocation, cap farming lists at six visible rows, sample QR at the existing 150 ms cadence, and stop camera tracks immediately on close.

## Routing
The watch remains procedural Three.js/R3F because its visibility, anchor, interaction, animation, and UI change live. Existing wallet cryptography, signing, swap routing, and QR codecs stay in TypeScript. Farming data comes directly from DeFiLlama's public yields endpoint in the browser; no API keys or wallet data are sent to it.
