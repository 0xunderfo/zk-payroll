"use client";

import { Suspense } from "react";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount, useWriteContract, useChainId } from "wagmi";
import { WalletButton } from "../../components/WalletButton";
import { ClaimForm } from "../../components/ClaimForm";
import { zkPayrollPrivateAbi } from "../../lib/abi";
import { contracts } from "../../lib/wagmi";

function ClaimContent() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const searchParams = useSearchParams();
  const { writeContractAsync } = useWriteContract();

  const [status, setStatus] = useState<"idle" | "claiming" | "success" | "error">("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [claimedAmount, setClaimedAmount] = useState<string | null>(null);

  const zkPayrollAddress = contracts.zkPayroll[chainId as keyof typeof contracts.zkPayroll] || contracts.zkPayroll[31337];
  const explorerUrl = chainId === 9746 ? "https://testnet.plasmascan.to" : null;

  const initialData = {
    payrollId: searchParams.get("pid") || "",
    commitmentIndex: searchParams.get("idx") || "",
    amount: searchParams.get("amt") || "",
    salt: searchParams.get("salt") || "",
  };

  const hasUrlParams = initialData.payrollId && initialData.amount && initialData.salt;

  const handleClaim = async (data: {
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
      console.error("Claim error:", e);
      const msg = e?.shortMessage || e?.message || "Claim failed";
      setErrorMsg(msg);
      setStatus("error");
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      {!isConnected ? (
        <div className="text-center py-20">
          <h2 className="text-3xl font-bold mb-4">Claim Your Payment</h2>
          <p className="text-gray-400 mb-8 max-w-md mx-auto">
            Connect the wallet that was registered in the payroll to claim your payment.
          </p>
          <div className="inline-block p-8 rounded-2xl bg-gray-800/50 border border-gray-700">
            <p className="text-gray-300 mb-4">Connect your wallet to claim</p>
            <WalletButton />
          </div>
        </div>
      ) : status === "success" ? (
        <div className="text-center py-12">
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 mx-auto mb-6">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-green-400 mb-2">Payment Claimed!</h3>
          <p className="text-gray-400 text-lg mb-4">
            You received <span className="text-white font-bold">{claimedAmount} USDT</span>
          </p>
          {txHash && (
            <p className="text-gray-500 text-sm font-mono">
              {explorerUrl ? (
                <a
                  href={`${explorerUrl}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline"
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
            className="mt-6 py-2 px-6 bg-gray-700 hover:bg-gray-600 rounded-xl font-medium transition-colors"
          >
            Claim Another
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {hasUrlParams && (
            <div className="bg-blue-900/20 border border-blue-800/50 rounded-xl p-4">
              <p className="text-blue-300 text-sm">
                Claim credentials loaded from link. Verify the details below and click "Claim Payment".
              </p>
            </div>
          )}

          <section className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 font-bold">
                $
              </div>
              <h2 className="text-xl font-semibold">Claim Payment</h2>
            </div>

            <div className="bg-gray-900/50 rounded-xl p-4 mb-4">
              <p className="text-gray-500 text-xs mb-1">Your Wallet</p>
              <p className="text-white font-mono">{address}</p>
            </div>

            {errorMsg && (
              <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-red-400 text-sm mb-4">
                {errorMsg}
              </div>
            )}

            <ClaimForm
              initialData={hasUrlParams ? initialData : undefined}
              onClaim={handleClaim}
              isSubmitting={status === "claiming"}
            />
          </section>

          <div className="bg-gray-800/30 rounded-xl p-4 text-sm text-gray-500">
            <p className="font-medium text-gray-400 mb-2">How claiming works:</p>
            <ul className="space-y-1">
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
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <div>
            <a href="/" className="text-2xl font-bold hover:text-gray-300 transition-colors">
              ZK Payroll
            </a>
            <p className="text-gray-400 text-sm">Claim your payment</p>
          </div>
          <WalletButton />
        </div>
      </header>

      <Suspense fallback={
        <div className="max-w-2xl mx-auto px-6 py-12 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-500 border-t-transparent"></div>
          <p className="text-gray-400 mt-4">Loading...</p>
        </div>
      }>
        <ClaimContent />
      </Suspense>

      <footer className="border-t border-gray-800 px-6 py-8 mt-12">
        <div className="max-w-2xl mx-auto text-center text-gray-500 text-sm">
          <p>Built at ETH Oxford 2026</p>
          <p className="mt-1">Powered by Plasma * Poseidon ZK privacy</p>
        </div>
      </footer>
    </main>
  );
}
