// scripts/deploy.ts — deploy IcedOutXRWatches (phase Closed).
//
//   $env:WATCH_OWNER = "0xYourMultisig"; pnpm deploy:mainnet            prints the settings, stops
//   $env:WATCH_CONFIRM = "mainnet"; pnpm deploy:mainnet                 deploys
//   (PowerShell; in bash: WATCH_OWNER=0x… WATCH_CONFIRM=mainnet pnpm deploy:mainnet)
//
//   WATCH_OWNER              required — the owner (a multisig on mainnet)
//   WATCH_BASE_URI           metadata folder ending in "/" (default: empty, set later), e.g. ar://<metadata manifest>/
//   WATCH_ROYALTY_RECEIVER   default: WATCH_OWNER
//   WATCH_ROYALTY_BPS        default: 500 (5 %)
//   WATCH_PASS_TOKEN         allowlist pass contract (default: none, set later)
//   WATCH_PASS_KIND          0 = ERC-20 / ERC-721 balanceOf, 1 = ERC-1155 (default 0)
//   WATCH_PASS_ID            ERC-1155 pass id (default 0)
//   WATCH_MAX_PER_WALLET     per-address cap, 0 = none (default 5)
//
// The deployer key (MAINNET_PRIVATE_KEY in the Hardhat keystore) pays the gas and is not the
// owner unless WATCH_OWNER is that same address.
import { network } from "hardhat";

const env = (name: string, fallback?: string) => {
  const v = process.env[name]?.trim();
  if (v) return v;
  if (fallback === undefined) throw new Error(`${name} is required`);
  return fallback;
};
const address = (name: string, fallback?: string) => {
  const v = env(name, fallback);
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(`${name} is not an address: ${v}`);
  return v as `0x${string}`;
};

const owner = address("WATCH_OWNER");
const baseURI = env("WATCH_BASE_URI", "");
const royalty = address("WATCH_ROYALTY_RECEIVER", owner);
const bps = BigInt(env("WATCH_ROYALTY_BPS", "500"));
const passToken = address("WATCH_PASS_TOKEN", "0x0000000000000000000000000000000000000000");
const passKind = Number(env("WATCH_PASS_KIND", "0"));
const passId = BigInt(env("WATCH_PASS_ID", "0"));
const maxPerWallet = BigInt(env("WATCH_MAX_PER_WALLET", "5"));
if (bps > 10_000n) throw new Error("WATCH_ROYALTY_BPS > 10000");
if (passKind !== 0 && passKind !== 1) throw new Error("WATCH_PASS_KIND must be 0 or 1");
if (baseURI && !baseURI.endsWith("/")) throw new Error("WATCH_BASE_URI must end in /");

const { viem } = await network.create();
const publicClient = await viem.getPublicClient();
const chainId = await publicClient.getChainId();
const [deployer] = await viem.getWalletClients();

console.log(`IcedOutXRWatches on chain ${chainId}
  deployer        ${deployer.account.address}
  owner           ${owner}
  base URI        ${baseURI || "(empty — set later with setBaseURI)"}
  royalties       ${Number(bps) / 100} % to ${royalty}
  allowlist pass  ${passToken === "0x0000000000000000000000000000000000000000" ? "none (set later with setPassToken)" : `${passToken} (${passKind === 0 ? "ERC-20 / ERC-721" : `ERC-1155 id ${passId}`})`}
  per wallet      ${maxPerWallet === 0n ? "no cap" : maxPerWallet}`);

if (chainId !== 1 && chainId !== 31337) throw new Error(`The watches ship on Ethereum mainnet only (or the local chain for testing); this is chain ${chainId}.`);
if (chainId === 1 && process.env.WATCH_CONFIRM !== "mainnet") {
  console.log("\nNothing sent. Deploying to Ethereum mainnet spends real ETH: check the settings above, then re-run with WATCH_CONFIRM=mainnet.");
  process.exit(0);
}

const watches = await viem.deployContract("IcedOutXRWatches", [owner, baseURI, royalty, bps, passToken, passKind, passId, maxPerWallet]);
console.log(`
Deployed: ${watches.address} (phase Closed)

Next:
  1. Put the address in lib/mint/config.ts (CONTRACT_ADDRESS) or set NEXT_PUBLIC_WATCH_CONTRACT for the build.
  2. Verify the source on Etherscan.
  3. Open the sale from the owner: setPhase(1) for the allowlist, setPhase(2) for everyone.`);
