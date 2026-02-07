/**
 * Wagmi Configuration
 * Sets up wallet connections and chain config
 */

import { http, createConfig } from "wagmi";
import { defineChain } from "viem";
import { injected } from "wagmi/connectors";

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

export const config = createConfig({
  chains: [localhost, plasmaTestnet],
  connectors: [injected()],
  transports: {
    [plasmaTestnet.id]: http(),
    [localhost.id]: http(),
  },
});

// Contract addresses (updated after deployment)
// These will be set when you run `forge script Deploy.s.sol`
export const contracts = {
  zkPayroll: {
    [plasmaTestnet.id]: "0x0000000000000000000000000000000000000000" as `0x${string}`,
    [localhost.id]: "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318" as `0x${string}`,
  },
  usdt: {
    [plasmaTestnet.id]: "0x0000000000000000000000000000000000000000" as `0x${string}`,
    [localhost.id]: "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6" as `0x${string}`,
  },
};
