"use client";

interface ProofStatusProps {
  status: "idle" | "generating" | "ready" | "submitting" | "complete" | "error";
  payrollData: {
    recipients: string[];
    amounts: string[];
    total: string;
  };
  commitments?: string[];
  onGenerateProof: () => void;
}

export function ProofStatus({ status, payrollData, commitments, onGenerateProof }: ProofStatusProps) {
  return (
    <div className="space-y-4">
      {/* Payroll Summary */}
      <div className="bg-gray-900/50 rounded-xl p-4">
        <p className="text-gray-400 text-sm mb-3">Payroll Data</p>
        <div className="space-y-2">
          {payrollData.recipients.map((addr, i) => (
            <div key={i} className="flex justify-between items-center text-sm">
              <span className="text-gray-400 font-mono">
                {addr.slice(0, 6)}...{addr.slice(-4)}
              </span>
              <span className="text-white font-medium">
                {payrollData.amounts[i]} USDT
              </span>
            </div>
          ))}
          <div className="border-t border-gray-700 pt-2 mt-2 flex justify-between items-center">
            <span className="text-gray-300 font-medium">Total</span>
            <span className="text-white font-bold">{payrollData.total} USDT</span>
          </div>
        </div>
      </div>

      {/* Privacy explanation */}
      <div className="bg-purple-900/20 border border-purple-800/50 rounded-xl p-4">
        <p className="text-purple-300 text-sm font-medium mb-2">
          What the ZK proof verifies:
        </p>
        <ul className="text-sm text-gray-400 space-y-1">
          <li>* Sum of all payments equals {payrollData.total} USDT</li>
          <li>* Each amount is bound to its recipient via Poseidon hash</li>
          <li>* Individual amounts are hidden behind commitments on-chain</li>
        </ul>
      </div>

      {/* Commitment hashes (shown after proof generation) */}
      {commitments && commitments.length > 0 && (
        <div className="bg-gray-900/50 rounded-xl p-4">
          <p className="text-gray-400 text-sm mb-2">Poseidon Commitments (on-chain)</p>
          <div className="space-y-1">
            {commitments.slice(0, payrollData.recipients.length).map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-gray-500">#{i}:</span>
                <code className="text-gray-400 font-mono truncate">
                  {c.slice(0, 20)}...{c.slice(-10)}
                </code>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status-based UI */}
      {status === "idle" && (
        <button
          onClick={onGenerateProof}
          className="w-full py-3 px-6 bg-purple-600 hover:bg-purple-500 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Generate ZK Proof
        </button>
      )}

      {status === "generating" && (
        <div className="text-center py-6">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-purple-500 border-t-transparent mb-4"></div>
          <p className="text-gray-300">Generating zero-knowledge proof...</p>
          <p className="text-gray-500 text-sm mt-1">
            Computing Poseidon hashes and proof (~5-10 seconds)
          </p>
        </div>
      )}

      {status === "ready" && (
        <div className="bg-green-900/20 border border-green-800 rounded-xl p-4 text-center">
          <svg className="w-8 h-8 text-green-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-green-400 font-medium">Proof generated successfully!</p>
          <p className="text-gray-400 text-sm mt-1">
            Amounts are now hidden behind Poseidon commitments
          </p>
        </div>
      )}

      {status === "error" && (
        <div className="bg-red-900/20 border border-red-800 rounded-xl p-4">
          <p className="text-red-400 font-medium">Failed to generate proof</p>
          <p className="text-gray-400 text-sm mt-1">
            Please check your inputs and try again
          </p>
          <button
            onClick={onGenerateProof}
            className="mt-3 py-2 px-4 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
