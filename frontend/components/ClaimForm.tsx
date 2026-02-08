"use client";

import { useState } from "react";

interface ClaimFormProps {
  initialData?: {
    claimToken?: string;
  };
  onClaim: (data: { claimToken: string }) => void;
  isSubmitting: boolean;
}

export function ClaimForm({ initialData, onClaim, isSubmitting }: ClaimFormProps) {
  const [claimToken, setClaimToken] = useState(initialData?.claimToken || "");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    setError(null);
    try {
      if (!claimToken.trim()) {
        setError("Claim token is required");
        return;
      }
      onClaim({ claimToken: claimToken.trim() });
    } catch (e: any) {
      setError("Invalid input values");
    }
  };

  const inputClass = "w-full bg-zk-inset border border-white/[0.06] rounded-lg px-4 py-2.5 text-zk-text font-display text-sm placeholder-zk-dim focus:outline-none focus:border-zk-accent/50 transition-colors";

  return (
    <div className="space-y-4">
      <div>
        <label className="text-zk-dim text-xs uppercase tracking-wider font-display block mb-1.5">
          Claim Token
        </label>
        <input
          type="text"
          value={claimToken}
          onChange={(e) => setClaimToken(e.target.value)}
          placeholder="Paste token from claim link"
          className={inputClass}
        />
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="w-full py-3 px-6 bg-zk-accent hover:bg-zk-accent-hover text-zk-bg disabled:opacity-50 rounded-xl font-semibold transition-all hover:-translate-y-px text-sm"
      >
        {isSubmitting ? "Claiming..." : "Claim Payment"}
      </button>
    </div>
  );
}
