"use client";

import { useAccount, useConnect, useDisconnect, useChainId, useBalance } from "wagmi";
import { contracts } from "../lib/wagmi";

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();

  const usdtAddress = contracts.usdt[chainId as keyof typeof contracts.usdt] || contracts.usdt[31337];

  const networkName = chainId === 9746 ? "Plasma" : chainId === 31337 ? "Localhost" : `Chain ${chainId}`;

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3">
        <div className="bg-gray-800 rounded-lg px-3 py-1.5 text-xs">
          <span className="text-green-400">*</span>
          <span className="text-gray-400 ml-1">{networkName}</span>
        </div>
        <div className="bg-gray-800 rounded-lg px-4 py-2">
          <span className="text-white font-mono text-sm">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
        </div>
        <button
          onClick={() => disconnect()}
          className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {connectors.map((connector) => (
        <button
          key={connector.id}
          onClick={() => connect({ connector })}
          disabled={isPending}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg font-medium transition-colors"
        >
          {isPending ? "Connecting..." : `Connect ${connector.name}`}
        </button>
      ))}
    </div>
  );
}
