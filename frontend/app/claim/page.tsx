"use client";

import { Suspense, useEffect } from "react";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount, useChainId } from "wagmi";
import { WalletButton } from "../../components/WalletButton";
import { ClaimForm } from "../../components/ClaimForm";
import {
  checkBackendHealth,
  verifyClaim,
  submitZeroFeeClaim,
  waitForClaimConfirmation,
} from "../../lib/api";

function ClaimContent() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<"idle" | "claiming" | "success" | "error">("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [claimedAmount, setClaimedAmount] = useState<string | null>(null);
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);
  const [claimProgress, setClaimProgress] = useState<string | null>(null);

  const explorerUrl = chainId === 9746 ? "https://testnet.plasmascan.to" : null;

  const initialData = {
    claimToken: searchParams.get("ct") || "",
  };

  const hasUrlParams = !!initialData.claimToken;

  // Check backend availability on mount
  useEffect(() => {
    checkBackendHealth().then((available) => {
      setBackendAvailable(available);
    });
  }, []);

  const handleZeroFeeClaim = async (data: { claimToken: string }) => {
    if (!address) return;
    setStatus("claiming");
    setErrorMsg(null);
    setClaimProgress("Submitting zero-fee claim...");

    try {
      if (!data.claimToken) {
        throw new Error("Pool-v1 claims require a claim token link.");
      }

      const verification = await verifyClaim(data.claimToken, address);
      if (!verification.valid) {
        throw new Error(verification.error || "Invalid claim token");
      }

      const result = await submitZeroFeeClaim(data.claimToken, address);

      setClaimProgress("Waiting for confirmation...");

      // Wait for confirmation
      const finalStatus = await waitForClaimConfirmation(result.claimId);

      if (finalStatus.status === "confirmed") {
        setTxHash(finalStatus.txHash || null);
        if (verification.amount) {
          setClaimedAmount((Number(verification.amount) / 1e6).toFixed(2));
        }
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

  const handleClaim = async (data: { claimToken: string }) => {
    if (!backendAvailable) {
      setErrorMsg("Backend unavailable. Pool-v1 claims require backend proof generation.");
      setStatus("error");
      return;
    }
    await handleZeroFeeClaim(data);
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
            {claimedAmount ? (
              <>
                You received <span className="text-zk-text font-bold font-display tabular-nums">{claimedAmount} USDT</span>
              </>
            ) : (
              <>Your payment was successfully delivered.</>
            )}
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

          <div className="bg-zk-surface rounded-xl p-4 border border-white/[0.06]">
            <div className="flex items-center justify-between">
              <span className="text-zk-dim text-xs uppercase tracking-wider font-display">Claim Method</span>
              {backendAvailable === null && <span className="text-zk-dim text-xs">Checking...</span>}
            </div>
            <p className="text-zk-dim text-xs mt-2">
              Pool-v1 claims are processed via backend proof generation and Plasma zero-fee relay.
            </p>
            {!backendAvailable && backendAvailable !== null && (
              <p className="text-amber-400 text-xs mt-1">
                Backend unavailable. Claiming is temporarily disabled.
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
              <li>2. Backend generates a zero-knowledge withdrawal proof for your note</li>
              <li>3. On success, USDT is relayed to your wallet with zero fees</li>
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
                <path d="M4 16 L44 16 L44 28 L4 28 Z" fill="#003D29"/>
                <rect x="10" y="19" width="28" height="5" rx="1" fill="#00FFB2" opacity="0.9"/>
                <circle cx="17" cy="21.5" r="1.75" fill="#003D29"/>
                <circle cx="24" cy="21.5" r="1.75" fill="#003D29"/>
                <circle cx="31" cy="21.5" r="1.75" fill="#003D29"/>
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
