/**
 * Chain definitions for Plasma
 */

import { defineChain } from "viem";

export const plasma = defineChain({
  id: 9746,
  name: "Plasma Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "ETH",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: [process.env.PLASMA_RPC_URL || "https://testnet-rpc.plasma.to"],
    },
  },
  blockExplorers: {
    default: {
      name: "Plasma Explorer",
      url: "https://testnet-explorer.plasma.to",
    },
  },
});
