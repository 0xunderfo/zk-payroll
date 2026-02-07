"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useChainId } from "wagmi";
import { parseUnits } from "viem";
import { PayrollForm } from "../../components/PayrollForm";
import { ProofStatus } from "../../components/ProofStatus";
import { WalletButton } from "../../components/WalletButton";
import { ClaimCredentials } from "../../components/ClaimCredentials";
import { generatePrivatePayrollProof, type PrivatePayrollProof, type ClaimCredential } from "../../lib/proof";
import { zkPayrollPrivateAbi, erc20Abi } from "../../lib/abi";
import { contracts } from "../../lib/wagmi";

const USDT_DECIMALS = 6;
const MAX_RECIPIENTS = 5;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as `0x${string}`;

export default function CreatePayroll() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [payrollData, setPayrollData] = useState<{
    recipients: string[];
    amounts: string[];
    total: string;
  } | null>(null);
  const [proofStatus, setProofStatus] = useState<
    "idle" | "generating" | "ready" | "submitting" | "complete" | "error"
  >("idle");
  const [proofData, setProofData] = useState<PrivatePayrollProof | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [payrollId, setPayrollId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { writeContractAsync } = useWriteContract();

  const zkPayrollAddress = contracts.zkPayroll[chainId as keyof typeof contracts.zkPayroll] || contracts.zkPayroll[31337];
  const usdtAddress = contracts.usdt[chainId as keyof typeof contracts.usdt] || contracts.usdt[31337];

  const explorerUrl = chainId === 9746 ? "https://testnet.plasmascan.to" : null;

  const handleGenerateProof = async () => {
    if (!payrollData) return;
    setProofStatus("generating");
    setErrorMsg(null);

    try {
      const rawAmounts = payrollData.amounts.map((a) =>
        parseUnits(a, USDT_DECIMALS).toString()
      );
      const rawTotal = parseUnits(payrollData.total, USDT_DECIMALS).toString();

      const proof = await generatePrivatePayrollProof(
        payrollData.recipients,
        rawAmounts,
        rawTotal
      );

      setProofData(proof);
      setProofStatus("ready");
    } catch (e: any) {
      console.error("Proof generation error:", e);
      setErrorMsg(e?.message || "Proof generation failed");
      setProofStatus("error");
    }
  };

  const handleSubmitPayroll = async () => {
    if (!payrollData || !proofData || !address) return;
    setProofStatus("submitting");
    setErrorMsg(null);

    try {
      const rawTotal = parseUnits(payrollData.total, USDT_DECIMALS);

      // Pad recipients and commitments to 5
      const paddedRecipients: `0x${string}`[] = payrollData.recipients.map(
        (r) => r as `0x${string}`
      );
      while (paddedRecipients.length < MAX_RECIPIENTS) {
        paddedRecipients.push(ZERO_ADDR);
      }

      const commitmentsBigInt = proofData.commitments.map((c) => BigInt(c));

      // Step 1: Approve USDT
      console.log("Approving USDT spend...");
      await writeContractAsync({
        address: usdtAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: "approve",
        args: [zkPayrollAddress as `0x${string}`, rawTotal],
      });

      // Step 2: Create payroll
      console.log("Creating payroll...");
      const executeTx = await writeContractAsync({
        address: zkPayrollAddress as `0x${string}`,
        abi: zkPayrollPrivateAbi,
        functionName: "createPayroll",
        args: [
          proofData.proof as any,
          rawTotal,
          BigInt(payrollData.recipients.length),
          commitmentsBigInt as any,
          paddedRecipients as any,
        ],
      });

      setTxHash(executeTx);
      // For now assume payrollId 0 for first payroll; in production read from events
      setPayrollId(0);
      setProofStatus("complete");
    } catch (e: any) {
      console.error("Transaction error:", e);
      setErrorMsg(e?.shortMessage || e?.message || "Transaction failed");
      setProofStatus("ready");
    }
  };

  const handleReset = () => {
    setPayrollData(null);
    setProofStatus("idle");
    setProofData(null);
    setTxHash(null);
    setPayrollId(null);
    setErrorMsg(null);
  };

  return (
    <main className="min-h-screen bg-zk-bg text-zk-text">
      {/* Nav */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-zk-bg/70 border-b border-white/[0.06]">
        <div className="max-w-4xl mx-auto flex justify-between items-center px-6 h-16">
          <a href="/" className="flex items-center gap-2 no-underline">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <circle cx="24" cy="24" r="20" fill="#00D395"/>
              <path d="M4 15 L44 15 L44 25 L4 25 Z" fill="#003D29"/>
              <rect x="12" y="18" width="24" height="4" fill="#00FFB2"/>
              <circle cx="18" cy="20" r="1.5" fill="#003D29"/>
              <circle cx="24" cy="20" r="1.5" fill="#003D29"/>
              <circle cx="30" cy="20" r="1.5" fill="#003D29"/>
            </svg>
            <span className="font-display font-bold text-lg text-zk-text">ZK Payroll</span>
          </a>
          <WalletButton />
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        {!isConnected ? (
          <div className="text-center py-20">
            {/* Hero glow */}
            <div className="absolute inset-x-0 top-16 h-[500px] pointer-events-none overflow-hidden">
              <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[radial-gradient(ellipse_at_center,_rgba(52,211,153,0.08)_0%,_transparent_70%)]"></div>
            </div>

            <div className="relative">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-zk-accent/20 bg-zk-accent/5 text-zk-accent text-xs font-display font-semibold uppercase tracking-wider mb-8">
                <span className="w-1.5 h-1.5 rounded-full bg-zk-accent animate-pulse"></span>
                Private Payroll on Plasma
              </div>

              <h2 className="font-display text-4xl md:text-5xl font-bold tracking-tight leading-[1.08] mb-5">
                Pay your team.<br/>
                <span className="text-zk-accent">Keep salaries private.</span>
              </h2>
              <p className="text-zk-muted max-w-lg mx-auto mb-10 text-lg leading-relaxed">
                Deposit USDT into a ZK-verified escrow. Individual amounts are hidden
                behind Poseidon commitments — only the total is visible on-chain.
              </p>
              <div className="inline-block p-8 rounded-2xl bg-zk-card border border-white/[0.06]">
                <p className="text-zk-muted mb-4 text-sm">Connect your wallet to start</p>
                <WalletButton />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Step 1: Upload Payroll */}
            <section className="bg-zk-card rounded-2xl p-6 border border-white/[0.06]">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-full bg-zk-accent/10 flex items-center justify-center text-zk-accent font-display font-bold text-sm">
                  1
                </div>
                <h2 className="font-display text-lg font-semibold tracking-tight">Upload Payroll</h2>
              </div>
              <PayrollForm
                onPayrollReady={(data) => {
                  setPayrollData(data);
                  setProofStatus("idle");
                  setProofData(null);
                  setTxHash(null);
                  setPayrollId(null);
                  setErrorMsg(null);
                }}
              />
            </section>

            {/* Step 2: Generate ZK Proof */}
            {payrollData && (
              <section className="bg-zk-card rounded-2xl p-6 border border-white/[0.06]">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-8 h-8 rounded-full bg-zk-accent/10 flex items-center justify-center text-zk-accent font-display font-bold text-sm">
                    2
                  </div>
                  <h2 className="font-display text-lg font-semibold tracking-tight">Generate ZK Proof</h2>
                </div>
                <ProofStatus
                  status={proofStatus}
                  payrollData={payrollData}
                  commitments={proofData?.commitments}
                  onGenerateProof={handleGenerateProof}
                />
              </section>
            )}

            {/* Step 3: Deposit & Create */}
            {proofStatus === "ready" && (
              <section className="bg-zk-card rounded-2xl p-6 border border-white/[0.06]">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-8 h-8 rounded-full bg-zk-accent/10 flex items-center justify-center text-zk-accent font-display font-bold text-sm">
                    3
                  </div>
                  <h2 className="font-display text-lg font-semibold tracking-tight">Deposit & Create Payroll</h2>
                </div>
                <div className="space-y-4">
                  <div className="bg-zk-inset rounded-xl p-4 border border-white/[0.04]">
                    <p className="text-zk-dim text-xs uppercase tracking-wider font-display mb-3">Summary</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-zk-dim text-xs font-display">Total Deposit</p>
                        <p className="text-2xl font-bold font-display tabular-nums mt-1">{payrollData?.total} <span className="text-zk-muted text-base">USDT</span></p>
                      </div>
                      <div>
                        <p className="text-zk-dim text-xs font-display">Recipients</p>
                        <p className="text-2xl font-bold font-display mt-1">{payrollData?.recipients.length}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-zk-muted">
                    <svg className="w-4 h-4 text-zk-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span>Amounts hidden via Poseidon commitments — only total visible on-chain</span>
                  </div>
                  {errorMsg && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm">
                      {errorMsg}
                    </div>
                  )}
                  <button
                    onClick={handleSubmitPayroll}
                    className="w-full py-3 px-6 bg-zk-accent hover:bg-zk-accent-hover text-zk-bg rounded-xl font-semibold transition-all hover:-translate-y-px text-sm"
                  >
                    Approve USDT & Create Payroll
                  </button>
                </div>
              </section>
            )}

            {/* Submitting state */}
            {proofStatus === "submitting" && (
              <section className="bg-zk-card rounded-2xl p-6 border border-white/[0.06]">
                <div className="text-center py-6">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-zk-accent border-t-transparent mb-4"></div>
                  <p className="text-zk-text text-sm">Submitting transactions...</p>
                  <p className="text-zk-dim text-xs mt-1">Please confirm in your wallet</p>
                </div>
              </section>
            )}

            {/* Step 4: Share Credentials */}
            {proofStatus === "complete" && proofData && (
              <>
                <section className="bg-zk-accent/5 rounded-2xl p-6 border border-zk-accent/15">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-zk-accent/10 flex items-center justify-center text-zk-accent mx-auto mb-4">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold font-display text-zk-accent mb-2">
                      Payroll Created
                    </h3>
                    <p className="text-zk-muted text-sm">
                      {payrollData?.recipients.length} payments deposited in escrow
                    </p>
                    {txHash && (
                      <p className="text-zk-dim text-sm mt-2 font-display">
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
                  </div>
                </section>

                <section className="bg-zk-card rounded-2xl p-6 border border-white/[0.06]">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400 font-display font-bold text-sm">
                      4
                    </div>
                    <h2 className="font-display text-lg font-semibold tracking-tight">Share Claim Links</h2>
                  </div>
                  <ClaimCredentials
                    credentials={proofData.claimCredentials}
                    payrollId={payrollId ?? 0}
                  />
                </section>

                <div className="text-center">
                  <button
                    onClick={handleReset}
                    className="py-3 px-6 bg-zk-card hover:bg-zk-surface border border-white/[0.06] hover:border-white/[0.1] rounded-xl font-semibold transition-all text-sm text-zk-muted hover:text-zk-text"
                  >
                    New Payroll
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] px-6 py-8 mt-12">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-sm">
          <div className="text-zk-dim">
            <span className="text-zk-muted font-semibold">ZK Payroll</span> &middot; ETH Oxford 2026
          </div>
          <div className="flex items-center gap-4 text-zk-dim">
            <span>Plasma</span>
            <span>&middot;</span>
            <span>Poseidon ZK Privacy</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
