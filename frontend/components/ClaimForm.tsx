"use client";

import { useState } from "react";

interface ClaimFormProps {
  initialData?: {
    payrollId: string;
    commitmentIndex: string;
    amount: string;
    salt: string;
  };
  onClaim: (data: {
    payrollId: bigint;
    commitmentIndex: bigint;
    amount: bigint;
    salt: bigint;
  }) => void;
  isSubmitting: boolean;
}

export function ClaimForm({ initialData, onClaim, isSubmitting }: ClaimFormProps) {
  const [payrollId, setPayrollId] = useState(initialData?.payrollId || "");
  const [commitmentIndex, setCommitmentIndex] = useState(initialData?.commitmentIndex || "");
  const [amount, setAmount] = useState(initialData?.amount || "");
  const [salt, setSalt] = useState(initialData?.salt || "");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    setError(null);
    try {
      if (!payrollId || !amount || !salt) {
        setError("Please fill in all fields");
        return;
      }
      onClaim({
        payrollId: BigInt(payrollId),
        commitmentIndex: BigInt(commitmentIndex || "0"),
        amount: BigInt(amount),
        salt: BigInt(salt),
      });
    } catch (e: any) {
      setError("Invalid input values");
    }
  };

  const inputClass = "w-full bg-zk-inset border border-white/[0.06] rounded-lg px-4 py-2.5 text-zk-text font-display text-sm placeholder-zk-dim focus:outline-none focus:border-zk-accent/50 transition-colors";

  return (
    <div className="space-y-4">
      <div>
        <label className="text-zk-dim text-xs uppercase tracking-wider font-display block mb-1.5">Payroll ID</label>
        <input
          type="text"
          value={payrollId}
          onChange={(e) => setPayrollId(e.target.value)}
          placeholder="0"
          className={inputClass}
        />
      </div>

      <div>
        <label className="text-zk-dim text-xs uppercase tracking-wider font-display block mb-1.5">
          Commitment Index
        </label>
        <input
          type="text"
          value={commitmentIndex}
          onChange={(e) => setCommitmentIndex(e.target.value)}
          placeholder="0"
          className={inputClass}
        />
      </div>

      <div>
        <label className="text-zk-dim text-xs uppercase tracking-wider font-display block mb-1.5">
          Amount (raw, 6 decimals)
        </label>
        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="3000000000"
          className={inputClass}
        />
        {amount && (
          <p className="text-zk-dim text-xs mt-1 font-display tabular-nums">
            = {(Number(amount) / 1e6).toFixed(2)} USDT
          </p>
        )}
      </div>

      <div>
        <label className="text-zk-dim text-xs uppercase tracking-wider font-display block mb-1.5">Salt</label>
        <input
          type="text"
          value={salt}
          onChange={(e) => setSalt(e.target.value)}
          placeholder="Secret salt value"
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
