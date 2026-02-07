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
      <div className="bg-zk-inset rounded-xl p-4 border border-white/[0.06]">
        <p className="text-zk-dim text-xs uppercase tracking-wider font-display mb-3">Payroll Data</p>
        <div className="space-y-2">
          {payrollData.recipients.map((addr, i) => (
            <div key={i} className="flex justify-between items-center text-sm">
              <span className="text-zk-muted font-display">
                {addr.slice(0, 6)}...{addr.slice(-4)}
              </span>
              <span className="text-zk-text font-medium font-display tabular-nums">
                {payrollData.amounts[i]} USDT
              </span>
            </div>
          ))}
          <div className="border-t border-white/[0.06] pt-2 mt-2 flex justify-between items-center">
            <span className="text-zk-text font-medium text-sm">Total</span>
            <span className="text-zk-text font-bold font-display tabular-nums">{payrollData.total} USDT</span>
          </div>
        </div>
      </div>

      {/* Privacy explanation */}
      <div className="bg-zk-accent/5 border border-zk-accent/10 rounded-xl p-4">
        <p className="text-zk-accent text-sm font-medium font-display mb-2">
          What the ZK proof verifies:
        </p>
        <ul className="text-sm text-zk-muted space-y-1">
          <li>* Sum of all payments equals {payrollData.total} USDT</li>
          <li>* Each amount is bound to its recipient via Poseidon hash</li>
          <li>* Individual amounts are hidden behind commitments on-chain</li>
        </ul>
      </div>

      {/* Commitment hashes (shown after proof generation) */}
      {commitments && commitments.length > 0 && (
        <div className="bg-zk-inset rounded-xl p-4 border border-white/[0.06]">
          <p className="text-zk-dim text-xs uppercase tracking-wider font-display mb-2">Poseidon Commitments (on-chain)</p>
          <div className="space-y-1">
            {commitments.slice(0, payrollData.recipients.length).map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-zk-dim font-display">#{i}:</span>
                <code className="text-zk-muted font-display truncate">
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
          className="w-full py-3 px-6 bg-zk-accent hover:bg-zk-accent-hover text-zk-bg rounded-xl font-semibold transition-all hover:-translate-y-px flex items-center justify-center gap-2 text-sm"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Generate ZK Proof
        </button>
      )}

      {status === "generating" && (
        <div className="text-center py-6">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-zk-accent border-t-transparent mb-4"></div>
          <p className="text-zk-text text-sm">Generating zero-knowledge proof...</p>
          <p className="text-zk-dim text-xs mt-1">
            Computing Poseidon hashes and proof
          </p>
        </div>
      )}

      {status === "ready" && (
        <div className="bg-zk-accent/5 border border-zk-accent/15 rounded-xl p-4 text-center">
          <svg className="w-8 h-8 text-zk-accent mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-zk-accent font-medium font-display text-sm">Proof generated successfully</p>
          <p className="text-zk-muted text-xs mt-1">
            Amounts are now hidden behind Poseidon commitments
          </p>
        </div>
      )}

      {status === "error" && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <p className="text-red-400 font-medium text-sm">Failed to generate proof</p>
          <p className="text-zk-muted text-xs mt-1">
            Please check your inputs and try again
          </p>
          <button
            onClick={onGenerateProof}
            className="mt-3 py-2 px-4 bg-red-500/20 hover:bg-red-500/30 border border-red-500/20 rounded-lg text-sm text-red-400 font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
