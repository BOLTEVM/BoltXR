// Hardhat 3 project for the Iced-Out XR Watches contract.
//
//   pnpm test             the Solidity tests in test/ (forge-std style, run by Hardhat)
//   pnpm chain            a local node: chain 31337 at http://127.0.0.1:8545, 20 funded test accounts
//   pnpm local            deploy to that node and open the sale (scripts/local.ts)
//   pnpm deploy:mainnet   deploy to Ethereum mainnet (scripts/deploy.ts) — real ETH
//
// Mainnet settings are configuration variables, kept out of the repo:
//   pnpm hardhat keystore set MAINNET_RPC_URL
//   pnpm hardhat keystore set MAINNET_PRIVATE_KEY      (the deployer; the owner should be a multisig)
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

const compiler = {
  version: "0.8.28",
  settings: {
    optimizer: { enabled: true, runs: 1000 },
    evmVersion: "cancun",
  },
};

export default defineConfig({
  plugins: [hardhatToolboxViem],
  paths: {
    sources: "./src",
    tests: { solidity: "./test" },
  },
  solidity: {
    profiles: {
      default: compiler,
      production: compiler,
    },
  },
  test: {
    solidity: {
      fuzz: { runs: 256 },
    },
  },
  networks: {
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    mainnet: {
      type: "http",
      chainType: "l1",
      chainId: 1,
      url: configVariable("MAINNET_RPC_URL"),
      accounts: [configVariable("MAINNET_PRIVATE_KEY")],
    },
  },
});
