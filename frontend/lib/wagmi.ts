/**
 * Wagmi Configuration
 * Sets up wallet connections and chain config with RainbowKit
 */

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain } from "viem";

export const plasmaTestnet = defineChain({
  id: 9746,
  name: "Plasma Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Plasma",
    symbol: "XPL",
  },
  rpcUrls: {
    default: {
      http: ["https://testnet-rpc.plasma.to"],
    },
  },
  blockExplorers: {
    default: {
      name: "Plasma Scan",
      url: "https://testnet.plasmascan.to",
    },
  },
  testnet: true,
});

export const localhost = defineChain({
  id: 31337,
  name: "Localhost",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["http://127.0.0.1:8545"],
    },
  },
  testnet: true,
});

export const config = getDefaultConfig({
  appName: "ZK Payroll",
  projectId: "YOUR_WALLETCONNECT_PROJECT_ID", // Get from cloud.walletconnect.com
  chains: [localhost, plasmaTestnet],
  ssr: true,
});

// Contract addresses (updated after deployment)
// These will be set when you run `forge script Deploy.s.sol`
export const contracts = {
  zkPayroll: {
    [plasmaTestnet.id]: "0xeE2130Fa435801EB4536eEBCBc9DAF75f2B02051" as `0x${string}`,
    [localhost.id]: "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318" as `0x${string}`,
  },
  usdt: {
    [plasmaTestnet.id]: "0x502012b361AebCE43b26Ec812B74D9a51dB4D412" as `0x${string}`,
    [localhost.id]: "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6" as `0x${string}`,
  },
};
