"use client";

import { Suspense, useEffect } from "react";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount, useWriteContract, useChainId } from "wagmi";
import { WalletButton } from "../../components/WalletButton";
import { ClaimForm } from "../../components/ClaimForm";
import { zkPayrollPrivateAbi } from "../../lib/abi";
import { contracts } from "../../lib/wagmi";
import {
  checkBackendHealth,
  submitZeroFeeClaim,
  waitForClaimConfirmation,
} from "../../lib/api";

function ClaimContent() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const searchParams = useSearchParams();
  const { writeContractAsync } = useWriteContract();

  const [status, setStatus] = useState<"idle" | "claiming" | "success" | "error">("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [claimedAmount, setClaimedAmount] = useState<string | null>(null);
  const [claimMode, setClaimMode] = useState<"zero-fee" | "direct">("zero-fee");
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);
  const [claimProgress, setClaimProgress] = useState<string | null>(null);

  const zkPayrollAddress = contracts.zkPayroll[chainId as keyof typeof contracts.zkPayroll] || contracts.zkPayroll[31337];
  const explorerUrl = chainId === 9746 ? "https://testnet.plasmascan.to" : null;

  const initialData = {
    payrollId: searchParams.get("pid") || "",
    commitmentIndex: searchParams.get("idx") || "",
    amount: searchParams.get("amt") || "",
    salt: searchParams.get("salt") || "",
  };

  const hasUrlParams = initialData.payrollId && initialData.amount && initialData.salt;

  // Check backend availability on mount
  useEffect(() => {
    checkBackendHealth().then((available) => {
      setBackendAvailable(available);
      if (!available) {
        setClaimMode("direct");
      }
    });
  }, []);

  const handleZeroFeeClaim = async (data: {
    payrollId: bigint;
    commitmentIndex: bigint;
    amount: bigint;
    salt: bigint;
  }) => {
    if (!address) return;
    setStatus("claiming");
    setErrorMsg(null);
    setClaimProgress("Submitting zero-fee claim...");

    try {
      // Submit to backend
      const result = await submitZeroFeeClaim(
        data.payrollId.toString(),
        data.commitmentIndex.toString(),
        address,
        data.amount.toString(),
        data.salt.toString()
      );

      setClaimProgress("Waiting for confirmation...");

      // Wait for confirmation
      const finalStatus = await waitForClaimConfirmation(result.claimId);

      if (finalStatus.status === "confirmed") {
        setTxHash(finalStatus.txHash || null);
        setClaimedAmount((Number(data.amount) / 1e6).toFixed(2));
        setStatus("success");
      } else {
        throw new Error(finalStatus.error || "Claim failed");
      }
    } catch (e: any) {
      console.error("Zero-fee claim error:", e);
      const msg = e?.message || "Claim failed";
      setErrorMsg(msg);
      setStatus("error");
    } finally {
      setClaimProgress(null);
    }
  };

  const handleDirectClaim = async (data: {
    payrollId: bigint;
    commitmentIndex: bigint;
    amount: bigint;
    salt: bigint;
  }) => {
    if (!address) return;
    setStatus("claiming");
    setErrorMsg(null);

    try {
      const tx = await writeContractAsync({
        address: zkPayrollAddress as `0x${string}`,
        abi: zkPayrollPrivateAbi,
        functionName: "claimPayment",
        args: [data.payrollId, data.commitmentIndex, data.amount, data.salt],
      });

      setTxHash(tx);
      setClaimedAmount((Number(data.amount) / 1e6).toFixed(2));
      setStatus("success");
    } catch (e: any) {
      console.error("Direct claim error:", e);
      const msg = e?.shortMessage || e?.message || "Claim failed";
      setErrorMsg(msg);
      setStatus("error");
    }
  };

  const handleClaim = async (data: {
    payrollId: bigint;
    commitmentIndex: bigint;
    amount: bigint;
    salt: bigint;
  }) => {
    if (claimMode === "zero-fee" && backendAvailable) {
      await handleZeroFeeClaim(data);
    } else {
      await handleDirectClaim(data);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      {!isConnected ? (
        <div className="text-center py-20">
          <h2 className="font-display text-3xl font-bold tracking-tight mb-4">Claim Your Payment</h2>
          <p className="text-zk-muted mb-8 max-w-md mx-auto">
            Connect the wallet that was registered in the payroll to claim your payment.
          </p>
          <div className="inline-block p-8 rounded-2xl bg-zk-card border border-white/[0.06]">
            <p className="text-zk-muted mb-4 text-sm">Connect your wallet to claim</p>
            <WalletButton />
          </div>
        </div>
      ) : status === "success" ? (
        <div className="text-center py-12">
          <div className="w-20 h-20 rounded-full bg-zk-accent/10 flex items-center justify-center text-zk-accent mx-auto mb-6">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold font-display text-zk-accent mb-2">Payment Claimed</h3>
          <p className="text-zk-muted text-lg mb-4">
            You received <span className="text-zk-text font-bold font-display tabular-nums">{claimedAmount} USDT</span>
          </p>
          {txHash && (
            <p className="text-zk-dim text-sm font-display">
              {explorerUrl ? (
                <a
                  href={`${explorerUrl}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zk-accent hover:text-zk-accent-hover transition-colors"
                >
                  tx: {txHash.slice(0, 10)}...{txHash.slice(-8)}
                </a>
              ) : (
                <>tx: {txHash.slice(0, 10)}...{txHash.slice(-8)}</>
              )}
            </p>
          )}
          <button
            onClick={() => {
              setStatus("idle");
              setTxHash(null);
              setClaimedAmount(null);
            }}
            className="mt-6 py-2.5 px-6 bg-zk-card hover:bg-zk-surface border border-white/[0.06] hover:border-white/[0.1] rounded-xl font-medium text-sm transition-all text-zk-muted hover:text-zk-text"
          >
            Claim Another
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {hasUrlParams && (
            <div className="bg-zk-accent/5 border border-zk-accent/10 rounded-xl p-4">
              <p className="text-zk-accent text-sm">
                Claim credentials loaded from link. Verify the details below and click &ldquo;Claim Payment&rdquo;.
              </p>
            </div>
          )}

          {/* Claim Mode Toggle */}
          <div className="bg-zk-surface rounded-xl p-4 border border-white/[0.06]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-zk-dim text-xs uppercase tracking-wider font-display">Claim Method</span>
              {backendAvailable === null && (
                <span className="text-zk-dim text-xs">Checking...</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => backendAvailable && setClaimMode("zero-fee")}
                disabled={!backendAvailable}
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                  claimMode === "zero-fee" && backendAvailable
                    ? "bg-zk-accent text-zk-bg"
                    : backendAvailable
                    ? "bg-zk-card text-zk-muted hover:text-zk-text border border-white/[0.06]"
                    : "bg-zk-inset text-zk-dim cursor-not-allowed border border-white/[0.04]"
                }`}
              >
                Zero-Fee (Gasless)
              </button>
              <button
                onClick={() => setClaimMode("direct")}
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                  claimMode === "direct"
                    ? "bg-zk-accent text-zk-bg"
                    : "bg-zk-card text-zk-muted hover:text-zk-text border border-white/[0.06]"
                }`}
              >
                Direct (Pay Gas)
              </button>
            </div>
            <p className="text-zk-dim text-xs mt-2">
              {claimMode === "zero-fee"
                ? "Claim via Plasma relayer — no gas fees required"
                : "Claim directly on-chain — you pay the gas fee"}
            </p>
            {!backendAvailable && backendAvailable !== null && (
              <p className="text-amber-400 text-xs mt-1">
                Zero-fee backend unavailable. Using direct claim.
              </p>
            )}
          </div>

          <section className="bg-zk-card rounded-2xl p-6 border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-full bg-zk-accent/10 flex items-center justify-center text-zk-accent font-display font-bold text-sm">
                $
              </div>
              <h2 className="font-display text-lg font-semibold tracking-tight">Claim Payment</h2>
            </div>

            <div className="bg-zk-inset rounded-xl p-4 mb-4 border border-white/[0.04]">
              <p className="text-zk-dim text-xs uppercase tracking-wider font-display mb-1">Your Wallet</p>
              <p className="text-zk-text font-display text-sm">{address}</p>
            </div>

            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm mb-4">
                {errorMsg}
              </div>
            )}

            {claimProgress && (
              <div className="bg-zk-accent/5 border border-zk-accent/10 rounded-lg p-3 text-zk-accent text-sm mb-4 flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-zk-accent border-t-transparent"></div>
                {claimProgress}
              </div>
            )}

            <ClaimForm
              initialData={hasUrlParams ? initialData : undefined}
              onClaim={handleClaim}
              isSubmitting={status === "claiming"}
            />
          </section>

          <div className="bg-zk-surface rounded-xl p-4 text-sm text-zk-dim border border-white/[0.06]">
            <p className="font-medium text-zk-muted mb-2 font-display text-xs uppercase tracking-wider">How claiming works</p>
            <ul className="space-y-1 text-zk-muted">
              <li>1. Your wallet address must match the one registered in the payroll</li>
              <li>2. The contract verifies Poseidon(your_address, amount, salt) matches the stored commitment</li>
              <li>3. On success, USDT is transferred directly to your wallet</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ClaimPage() {
  return (
    <main className="min-h-screen bg-zk-bg text-zk-text">
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-zk-bg/70 border-b border-white/[0.06]">
        <div className="max-w-2xl mx-auto flex justify-between items-center px-6 h-16">
          <div>
            <a href="/" className="font-display font-bold text-lg text-zk-text hover:text-zk-muted transition-colors no-underline flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 48" fill="none" aria-hidden="true">
                <defs>
                  <linearGradient id="coinGradClaim" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00FFB2"/>
                    <stop offset="100%" stopColor="#00D395"/>
                  </linearGradient>
                </defs>
                <circle cx="24" cy="24" r="20" fill="url(#coinGradClaim)"/>
                <circle cx="24" cy="24" r="10" fill="#0A0F0D"/>
                <path d="M4 17 L44 17 L44 26 L4 26 Z" fill="#003D29"/>
                <rect x="10" y="19.5" width="28" height="4" rx="1" fill="#00FFB2" opacity="0.9"/>
                <circle cx="17" cy="21.5" r="1.5" fill="#003D29"/>
                <circle cx="24" cy="21.5" r="1.5" fill="#003D29"/>
                <circle cx="31" cy="21.5" r="1.5" fill="#003D29"/>
              </svg>
              Private Payroll
            </a>
            <p className="text-zk-dim text-xs font-display mt-0.5">Claim your payment</p>
          </div>
          <WalletButton />
        </div>
      </header>

      <Suspense fallback={
        <div className="max-w-2xl mx-auto px-6 py-12 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-zk-accent border-t-transparent"></div>
          <p className="text-zk-muted mt-4 text-sm">Loading...</p>
        </div>
      }>
        <ClaimContent />
      </Suspense>

      <footer className="border-t border-white/[0.06] px-6 py-8 mt-12">
        <div className="max-w-2xl mx-auto flex items-center justify-between text-sm">
          <div className="text-zk-dim">
            <span className="text-zk-muted font-semibold">Private Payroll</span> &middot; ETH Oxford 2026
          </div>
          <div className="text-zk-dim">
            Programmable Cryptography &middot; Powered by Plasma
          </div>
        </div>
      </footer>
    </main>
  );
}
