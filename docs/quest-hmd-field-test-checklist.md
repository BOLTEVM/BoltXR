# BoltXR Quest / HMD Field-Test Checklist

Use this checklist on each release candidate and each supported headset/browser combination. Desktop emulation does not replace this pass.

## Test record

- Build / commit:
- Date and tester:
- Headset model and OS version:
- Browser and version:
- Controllers, hand tracking, or both:
- Network and chain:
- Test account / vault used:
- Result: PASS / FAIL / BLOCKED

Use a dedicated test vault with small amounts. Do not record recovery phrases, private keys, PINs, or unredacted wallet addresses in test evidence.

## 1. Setup and browser security

- [ ] Serve the release candidate over HTTPS, or use the packaged app's trusted application origin.
      For a dev build, run the ordinary `pnpm dev`: USB opens `http://localhost:3000` on the headset;
      Wi-Fi opens the printed `https://<PC address>:3001`. See README, "Opening the dev server on a Meta Quest".
- [ ] Confirm native WebXR is available without desktop XR emulation flags.
- [ ] Enter and exit immersive VR repeatedly; the scene resumes without a blank canvas or duplicate interface.
- [ ] Confirm camera and clipboard permission prompts are understandable and only appear when needed.
- [ ] Deny camera permission: scanning shows a useful retry/paste fallback and does not freeze.
- [ ] Revoke camera permission at browser level, then retry: the error and recovery instructions remain accurate.
- [ ] Background and resume the browser: wallet lock state and camera lifecycle remain correct.

Evidence:

## 2. Wrist watch and interaction

Test once with controllers and once with hand tracking where supported.

- [ ] The watch attaches to the intended wrist/controller without mirroring the wrong hand.
- [ ] It remains readable during normal head and wrist movement and does not obscure the main task panel.
- [ ] The crown toggles the watch open and closed reliably.
- [ ] Home, Pay, Swap, Farm, and Scan each open the correct workflow.
- [ ] Buttons have clear hover/pressed states and do not trigger twice from one pinch or controller press.
- [ ] Adjacent buttons are difficult to hit accidentally; text remains readable at the intended viewing distance.
- [ ] Expanded panels appear in front of the HMD, not behind the user or inside world geometry.
- [ ] The scene dock sits at waist height in front of you; each of the five tiles can be poked with a
      finger and picked with a controller ray, lights up on hover, and the current scene is framed.
- [ ] Closing a task restores the normal scene and watch state.
- [ ] Rapidly switching tasks does not leave duplicate panels, stale data, or an active camera.
- [ ] Recentering the headset produces a usable layout.
- [ ] Left-handed use, seated mode, and standing mode are checked where supported.

Evidence:

## 3. Receive and clipboard

- [ ] Unlock a test vault and open Pay.
- [ ] The selected network, displayed address, and receive QR belong to the same account and chain.
- [ ] Switch networks: the address and QR update without showing the previous network's QR.
- [ ] Scan the receive QR using a separate trusted phone/wallet; confirm the decoded chain and address exactly.
- [ ] Copy Address copies the complete address, not a truncated display value.
- [ ] Paste the copied value into an independent text field and compare it character-for-character.
- [ ] Copy feedback appears and clears; clipboard denial produces a recoverable message.
- [ ] Locked and empty-vault states never display a fabricated address or QR.

Evidence:

## 4. HMD QR scanning

Test with QR codes displayed on a phone and on another screen. Include plain addresses, EIP-681, BIP-21 where applicable, and unsupported payloads.

- [ ] Camera starts only after opening Scan and accepting permission.
- [ ] The viewfinder receives live frames, is oriented correctly, and is bright enough to aim.
- [ ] A valid wallet QR is decoded at a comfortable distance without excessive exposure time.
- [ ] The verified address and network match the encoded payload before continuing.
- [ ] Use in Send Flow transfers the exact decoded address into the recipient field.
- [ ] An address on an unsupported or mismatched network cannot be treated as verified.
- [ ] Unsupported QR content shows an error and never initiates a transfer or contract action.
- [ ] Scan Again clears the previous result and restarts decoding.
- [ ] Close / Stop Camera stops all tracks; the headset's camera indicator clears.
- [ ] Switching directly from Scan to another task also stops the camera.
- [ ] Camera busy, no camera, denied permission, and no-frame timeout each show the correct fallback.
- [ ] Low light, glare, tilted QR, and moving QR tests fail safely rather than producing a wrong address.

Evidence:

## 5. Send money

Use the smallest practical test amount on a testnet or a low-value mainnet account.

- [ ] Paste a valid recipient using the paste control; the full value is preserved.
- [ ] Invalid, empty, truncated, and wrong-network recipients are rejected before signing.
- [ ] Review screen shows the intended network, asset, amount, recipient, and estimated fee.
- [ ] Locking or backgrounding the wallet cannot silently approve a transaction.
- [ ] Cancel returns without broadcasting.
- [ ] Approve a small test transfer and independently confirm its hash on a block explorer.
- [ ] Insufficient balance, insufficient gas, rejected RPC, and timeout states remain recoverable.
- [ ] Retrying after an uncertain result does not accidentally broadcast twice; check the transaction hash/history first.

Transaction hash (public test transaction only):

Evidence:

## 6. Swap

- [ ] Swap opens from the watch; the former freestanding swap scale is absent.
- [ ] Source and destination assets, networks, amount, quote, slippage, and fees are readable in the HMD.
- [ ] Changing an input refreshes the quote and identifies stale/unavailable quotes.
- [ ] A tiny test swap requires explicit review and approval.
- [ ] Rejection/cancellation does not broadcast.
- [ ] A successful swap is independently confirmed on-chain and balances refresh.
- [ ] Price-impact, insufficient-liquidity, approval, and failed-transaction states do not report false success.

Transaction hash (public test transaction only):

Evidence:

## 7. Yield radar and farming visualizers

- [ ] Farm loads live opportunities and shows a timestamp/source state.
- [ ] TVL, APY, stablecoin, sorting, and paging controls update the visible rows predictably.
- [ ] Selecting a pool updates its risk, base/reward APY, exposure, and projection bars.
- [ ] Amount and term controls update the projection without implying guaranteed returns.
- [ ] Extreme APY and very low TVL pools are visibly flagged/filterable.
- [ ] Pool links open the intended external destination only after a deliberate action.
- [ ] Offline, timeout, malformed response, and empty-filter states show retry/recovery UI rather than old data presented as live.
- [ ] Rescan aborts or supersedes the previous request; repeated taps do not cause stale results to overwrite fresh ones.
- [ ] No wallet connection, deposit, or token approval occurs merely by scanning or selecting an opportunity.

Evidence:

## 8. Performance, comfort, and resilience

Measure with headset profiling tools where available; do not infer frame rate from desktop tests.

- [ ] Record average/frame-time percentiles and dropped frames for Home, Swap, Farm, and active QR scanning.
- [ ] The experience meets the team's chosen target headset frame-rate budget without sustained judder.
- [ ] A 15-minute session shows no continuing memory, geometry, texture, or camera-resource growth.
- [ ] Rapid task switching and repeated QR scans do not degrade rendering or input response.
- [ ] Watch and panel text is legible without excessive head movement or vergence discomfort.
- [ ] Wrist placement does not cause persistent occlusion, accidental activation, or uncomfortable arm posture.
- [ ] Thermal behavior and battery drain are acceptable for the intended session length.
- [ ] Network loss and recovery do not crash the scene or falsely confirm financial actions.

Measurements:

## 9. Release gate

- [ ] All fund-moving paths were tested with explicit amounts and independently verified outcomes.
- [ ] No open severity-1 or severity-2 defects remain.
- [ ] No camera remains active after its workflow closes.
- [ ] No secrets, PINs, recovery phrases, or private keys appear in logs or screenshots.
- [ ] Supported headset/browser versions and known limitations are documented.
- [ ] Final production build, TypeScript, lint, and desktop smoke checks pass on the same release candidate.
- [ ] Security review/audit status is accurately stated; a successful field test is not represented as an audit.

Release decision: GO / NO-GO

Open defects and owners:

Sign-off:
