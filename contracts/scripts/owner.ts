// scripts/owner.ts — owner actions, for an owner whose key Hardhat holds (the local chain, or a
// mainnet owner that is not a multisig; a multisig owner uses its own app, e.g. Safe's
// transaction builder, with the same functions).
//
//   $env:WATCH = "0x…"; $env:ACTION = "phase"; $env:ARG = "2"; pnpm owner --network localhost   (PowerShell)
//   WATCH=0x… ACTION=phase ARG=2 pnpm owner --network localhost                                  (bash)
//
//   phase <0|1|2>                Closed, Allowlist, Public
//   max-per-wallet <n>           0 = no cap
//   base-uri <ar://…/>           tokenURI = base + NNN.json
//   contract-uri <ar://…/collection.json>
//   pass <token> [kind] [id] [minBalance]
//   freeze                       lock the base URI forever
//   withdraw <to>                send the proceeds
import { network } from "hardhat";

const watchAddress = process.env.WATCH?.trim() ?? "";
const action = process.env.ACTION?.trim() ?? "";
const args = (process.env.ARG ?? "").split(/\s+/).filter(Boolean);
if (!/^0x[0-9a-fA-F]{40}$/.test(watchAddress)) throw new Error("set WATCH to the contract address");

const { viem } = await network.create();
const publicClient = await viem.getPublicClient();
const chainId = await publicClient.getChainId();
const watches = await viem.getContractAt("IcedOutXRWatches", watchAddress as `0x${string}`);
const addr = (v: string | undefined) => {
  if (!v || !/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(`not an address: ${v}`);
  return v as `0x${string}`;
};

let hash: `0x${string}`;
switch (action) {
  case "phase": hash = await watches.write.setPhase([Number(args[0])]); break;
  case "max-per-wallet": hash = await watches.write.setMaxPerWallet([BigInt(args[0] ?? "0")]); break;
  case "base-uri": hash = await watches.write.setBaseURI([args[0] ?? ""]); break;
  case "contract-uri": hash = await watches.write.setContractURI([args[0] ?? ""]); break;
  case "pass": hash = await watches.write.setPassToken([addr(args[0]), Number(args[1] ?? 0), BigInt(args[2] ?? "0"), BigInt(args[3] ?? "1")]); break;
  case "freeze": hash = await watches.write.freezeMetadata(); break;
  case "withdraw": hash = await watches.write.withdraw([addr(args[0])]); break;
  default: throw new Error(`unknown ACTION "${action}" (phase, max-per-wallet, base-uri, contract-uri, pass, freeze, withdraw)`);
}
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log(`${action} on chain ${chainId}: ${receipt.status} (${hash})`);
