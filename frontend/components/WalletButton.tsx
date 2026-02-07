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
        <div className="bg-zk-card border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs">
          <span className="text-zk-accent">*</span>
          <span className="text-zk-muted ml-1">{networkName}</span>
        </div>
        <div className="bg-zk-card border border-white/[0.06] rounded-lg px-4 py-2">
          <span className="text-zk-text font-display text-sm">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
        </div>
        <button
          onClick={() => disconnect()}
          className="px-3 py-2 bg-zk-card hover:bg-zk-surface border border-white/[0.06] hover:border-white/[0.1] rounded-lg text-sm font-medium transition-all text-zk-muted hover:text-zk-text"
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
          className="px-4 py-2 bg-zk-accent hover:bg-zk-accent-hover text-zk-bg disabled:opacity-50 rounded-lg font-semibold text-sm transition-all hover:-translate-y-px"
        >
          {isPending ? "Connecting..." : `Connect ${connector.name}`}
        </button>
      ))}
    </div>
  );
}
