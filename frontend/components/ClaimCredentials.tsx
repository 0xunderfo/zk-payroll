"use client";

import { useState } from "react";
import type { ClaimCredential } from "../lib/types";

interface ClaimCredentialsProps {
  credentials: ClaimCredential[];
}

export function ClaimCredentials({ credentials }: ClaimCredentialsProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const buildClaimUrl = (cred: ClaimCredential) => {
    if (cred.claimUrl) return cred.claimUrl;
    if (cred.claimToken) {
      const params = new URLSearchParams({ ct: cred.claimToken });
      return `${window.location.origin}/claim?${params.toString()}`;
    }
    const params = new URLSearchParams({
      amt: cred.amount,
      c: cred.commitment,
    });
    return `${window.location.origin}/claim?${params.toString()}`;
  };

  const copyToClipboard = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="space-y-4">
      <p className="text-zk-muted text-sm">
        Share these claim links with each recipient. They will need to connect
        the matching wallet to claim their payment.
      </p>

      {credentials.map((cred, i) => {
        const claimUrl = buildClaimUrl(cred);
        return (
          <div
            key={i}
            className="bg-zk-inset rounded-xl p-4 border border-white/[0.06]"
          >
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-zk-dim text-xs uppercase tracking-wider font-display">Recipient {i + 1}</p>
                <p className="text-zk-text font-display text-sm mt-0.5">
                  {cred.recipient.slice(0, 6)}...{cred.recipient.slice(-4)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-zk-dim text-xs uppercase tracking-wider font-display">Amount</p>
                <p className="text-zk-text font-medium font-display tabular-nums mt-0.5">
                  {(Number(cred.amount) / 1e6).toFixed(2)} USDT
                </p>
              </div>
            </div>

            <div className="bg-zk-bg rounded-lg p-3 border border-white/[0.04]">
              <p className="text-zk-dim text-xs font-display mb-1">Claim Link</p>
              <div className="flex items-center gap-2">
                <code className="text-xs text-zk-muted break-all flex-1 font-display">
                  {claimUrl}
                </code>
                <button
                  onClick={() => copyToClipboard(claimUrl, i)}
                  className="shrink-0 px-3 py-1.5 bg-zk-accent hover:bg-zk-accent-hover text-zk-bg rounded-lg text-xs font-semibold transition-all"
                >
                  {copiedIndex === i ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
