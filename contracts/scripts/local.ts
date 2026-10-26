// scripts/local.ts — the watches on the local Hardhat chain, ready to mint and wear.
//
//   pnpm chain                                   terminal 1: the node (keep it running)
//   pnpm local                                   terminal 2: deploy, open the public sale
//   $env:MINT_TO = "0xYourVaultAddress"; $env:MINT_COUNT = "2"; pnpm local      (PowerShell)
//   MINT_TO=0xYourVaultAddress MINT_COUNT=2 pnpm local                          (bash)
//                                                …and mint the first two to an address of yours
//
// Then run the wallet with `pnpm dev` and these in .env.local (the wallet only honours the local
// chain on a dev server; a built app is always mainnet):
//   NEXT_PUBLIC_WATCH_CHAIN_ID=31337
//   NEXT_PUBLIC_WATCH_CONTRACT=<the address printed below>
//
// The node starts empty every time, so the first deployment always lands at the same address.
import { network } from "hardhat";

const LOCAL_CHAIN_ID = 31337;
const ZERO = "0x0000000000000000000000000000000000000000";
const PUBLIC = 2; // Phase.Public

const { viem } = await network.create();
const publicClient = await viem.getPublicClient();
const chainId = await publicClient.getChainId();
if (chainId !== LOCAL_CHAIN_ID) throw new Error(`scripts/local.ts is for the local chain (${LOCAL_CHAIN_ID}); this is chain ${chainId}.`);

const [deployer] = await viem.getWalletClients();
const owner = deployer.account.address;
const wait = async (hash: `0x${string}`) => {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`transaction ${hash} reverted`);
};

// owner = royalty receiver = test account #0; no allowlist pass; no per-wallet cap
const watches = await viem.deployContract("IcedOutXRWatches", [owner, "", owner, 500n, ZERO, 0, 0n, 0n]);
await wait(await watches.write.setPhase([PUBLIC]));
console.log(`IcedOutXRWatches  ${watches.address}  (chain ${chainId}, public sale open, owner ${owner})`);

const to = process.env.MINT_TO?.trim();
if (to) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(to)) throw new Error(`MINT_TO is not an address: ${to}`);
  const count = Math.max(1, Math.min(150, Number(process.env.MINT_COUNT ?? 1) || 1));
  const first = Number(await watches.read.totalMinted()) + 1;
  const cost = await watches.read.quote([BigInt(count)]);
  await wait(await watches.write.mint([BigInt(count)], { value: cost }));
  for (let id = first; id < first + count; id++) {
    await wait(await watches.write.transferFrom([owner, to as `0x${string}`, BigInt(id)]));
  }
  console.log(`minted #${first}${count > 1 ? `–#${first + count - 1}` : ""} to ${to}`);
}

console.log(`
For the wallet (.env.local, then pnpm dev):
  NEXT_PUBLIC_WATCH_CHAIN_ID=31337
  NEXT_PUBLIC_WATCH_CONTRACT=${watches.address}

To mint from the mint modal with a browser wallet, add the network "Hardhat local"
(http://127.0.0.1:8545, chain 31337) to a separate test profile and import one of the accounts
\`pnpm chain\` printed. Those keys are public: never send real funds to them.`);
