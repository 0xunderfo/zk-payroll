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

  return (
    <div className="space-y-4">
      <div>
        <label className="text-gray-400 text-sm block mb-1">Payroll ID</label>
        <input
          type="text"
          value={payrollId}
          onChange={(e) => setPayrollId(e.target.value)}
          placeholder="0"
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="text-gray-400 text-sm block mb-1">
          Commitment Index
        </label>
        <input
          type="text"
          value={commitmentIndex}
          onChange={(e) => setCommitmentIndex(e.target.value)}
          placeholder="0"
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="text-gray-400 text-sm block mb-1">
          Amount (raw, 6 decimals)
        </label>
        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="3000000000"
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        {amount && (
          <p className="text-gray-500 text-xs mt-1">
            = {(Number(amount) / 1e6).toFixed(2)} USDT
          </p>
        )}
      </div>

      <div>
        <label className="text-gray-400 text-sm block mb-1">Salt</label>
        <input
          type="text"
          value={salt}
          onChange={(e) => setSalt(e.target.value)}
          placeholder="Secret salt value"
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="w-full py-3 px-6 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-xl font-semibold transition-colors"
      >
        {isSubmitting ? "Claiming..." : "Claim Payment"}
      </button>
    </div>
  );
}
