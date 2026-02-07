"use client";

import { useState } from "react";
import type { ClaimCredential } from "../lib/proof";

interface ClaimCredentialsProps {
  credentials: ClaimCredential[];
  payrollId: number;
}

export function ClaimCredentials({ credentials, payrollId }: ClaimCredentialsProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const buildClaimUrl = (cred: ClaimCredential) => {
    const params = new URLSearchParams({
      pid: payrollId.toString(),
      idx: cred.commitmentIndex.toString(),
      amt: cred.amount,
      salt: cred.salt,
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
      <p className="text-gray-400 text-sm">
        Share these claim links with each recipient. They will need to connect
        the matching wallet to claim their payment.
      </p>

      {credentials.map((cred, i) => {
        const claimUrl = buildClaimUrl(cred);
        return (
          <div
            key={i}
            className="bg-gray-900/50 rounded-xl p-4 border border-gray-700"
          >
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-gray-500 text-xs">Recipient {i + 1}</p>
                <p className="text-white font-mono text-sm">
                  {cred.recipient.slice(0, 6)}...{cred.recipient.slice(-4)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-gray-500 text-xs">Amount</p>
                <p className="text-white font-medium">
                  {(Number(cred.amount) / 1e6).toFixed(2)} USDT
                </p>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-gray-500 text-xs mb-1">Claim Link</p>
              <div className="flex items-center gap-2">
                <code className="text-xs text-gray-300 break-all flex-1">
                  {claimUrl}
                </code>
                <button
                  onClick={() => copyToClipboard(claimUrl, i)}
                  className="shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-medium transition-colors"
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
