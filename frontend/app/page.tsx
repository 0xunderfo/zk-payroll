"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useChainId } from "wagmi";
import { parseUnits } from "viem";
import { PayrollForm } from "../components/PayrollForm";
import { ProofStatus } from "../components/ProofStatus";
import { WalletButton } from "../components/WalletButton";
import { ClaimCredentials } from "../components/ClaimCredentials";
import { generatePrivatePayrollProof, type PrivatePayrollProof, type ClaimCredential } from "../lib/proof";
import { zkPayrollPrivateAbi, erc20Abi } from "../lib/abi";
import { contracts } from "../lib/wagmi";

const USDT_DECIMALS = 6;
const MAX_RECIPIENTS = 5;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as `0x${string}`;

export default function Home() {
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
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">ZK Payroll</h1>
            <p className="text-gray-400 text-sm">
              Private stablecoin payments with Poseidon commitments
            </p>
          </div>
          <WalletButton />
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        {!isConnected ? (
          <div className="text-center py-20">
            <h2 className="text-3xl font-bold mb-4">
              Private Payroll for DAOs
            </h2>
            <p className="text-gray-400 mb-8 max-w-md mx-auto">
              Pay your team in stablecoins while keeping individual salaries
              private. Amounts are hidden behind Poseidon hash commitments -
              only the total is visible on-chain.
            </p>
            <div className="inline-block p-8 rounded-2xl bg-gray-800/50 border border-gray-700">
              <p className="text-gray-300 mb-4">Connect your wallet to start</p>
              <WalletButton />
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Step 1: Upload Payroll */}
            <section className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold">
                  1
                </div>
                <h2 className="text-xl font-semibold">Upload Payroll</h2>
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
              <section className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-bold">
                    2
                  </div>
                  <h2 className="text-xl font-semibold">Generate ZK Proof</h2>
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
              <section className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 font-bold">
                    3
                  </div>
                  <h2 className="text-xl font-semibold">Deposit & Create Payroll</h2>
                </div>
                <div className="space-y-4">
                  <div className="bg-gray-900/50 rounded-xl p-4">
                    <p className="text-gray-400 text-sm mb-2">Summary</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-gray-500 text-xs">Total Deposit</p>
                        <p className="text-2xl font-bold">{payrollData?.total} USDT</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs">Recipients</p>
                        <p className="text-2xl font-bold">{payrollData?.recipients.length}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span>Amounts hidden via Poseidon commitments - only total visible on-chain</span>
                  </div>
                  {errorMsg && (
                    <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-red-400 text-sm">
                      {errorMsg}
                    </div>
                  )}
                  <button
                    onClick={handleSubmitPayroll}
                    className="w-full py-3 px-6 bg-green-600 hover:bg-green-500 rounded-xl font-semibold transition-colors"
                  >
                    Approve USDT & Create Payroll
                  </button>
                </div>
              </section>
            )}

            {/* Submitting state */}
            {proofStatus === "submitting" && (
              <section className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
                <div className="text-center py-6">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-green-500 border-t-transparent mb-4"></div>
                  <p className="text-gray-300">Submitting transactions...</p>
                  <p className="text-gray-500 text-sm mt-1">Please confirm in your wallet</p>
                </div>
              </section>
            )}

            {/* Step 4: Share Credentials */}
            {proofStatus === "complete" && proofData && (
              <>
                <section className="bg-green-900/20 rounded-2xl p-6 border border-green-800">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 mx-auto mb-4">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-green-400 mb-2">
                      Payroll Created!
                    </h3>
                    <p className="text-gray-400">
                      {payrollData?.recipients.length} payments deposited in escrow
                    </p>
                    {txHash && (
                      <p className="text-gray-500 text-sm mt-2 font-mono">
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
                  </div>
                </section>

                <section className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400 font-bold">
                      4
                    </div>
                    <h2 className="text-xl font-semibold">Share Claim Links</h2>
                  </div>
                  <ClaimCredentials
                    credentials={proofData.claimCredentials}
                    payrollId={payrollId ?? 0}
                  />
                </section>

                <div className="text-center">
                  <button
                    onClick={handleReset}
                    className="py-3 px-6 bg-gray-700 hover:bg-gray-600 rounded-xl font-semibold transition-colors"
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
      <footer className="border-t border-gray-800 px-6 py-8 mt-12">
        <div className="max-w-4xl mx-auto text-center text-gray-500 text-sm">
          <p>Built at ETH Oxford 2026</p>
          <p className="mt-1">
            Powered by Plasma * Zero-fee USDT transfers * Poseidon ZK privacy
          </p>
        </div>
      </footer>
    </main>
  );
}
