"use client";

import { useState } from "react";
import { useAccount, useChainId, useReadContract, useWalletClient } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { PayrollForm } from "../../components/PayrollForm";
import { WalletButton } from "../../components/WalletButton";
import { ClaimCredentials } from "../../components/ClaimCredentials";
import {
  getEscrowAddress,
  createPayrollGasless,
  generateNonce,
  type ClaimCredential
} from "../../lib/api";
import {
  erc20Abi,
  USDT0_EIP712_DOMAIN,
  TRANSFER_WITH_AUTHORIZATION_TYPES,
  type EIP3009Authorization
} from "../../lib/abi";
import { contracts } from "../../lib/wagmi";

const USDT_DECIMALS = 6;

export default function CreatePayroll() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const [payrollData, setPayrollData] = useState<{
    recipients: string[];
    amounts: string[];
    total: string;
  } | null>(null);
  const [proofStatus, setProofStatus] = useState<"idle" | "ready" | "submitting" | "complete" | "error">("idle");
  const [claimCredentials, setClaimCredentials] = useState<ClaimCredential[]>([]);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const usdtAddress = contracts.usdt[chainId as keyof typeof contracts.usdt] || contracts.usdt[31337];

  const explorerUrl = chainId === 9746 ? "https://testnet.plasmascan.to" : null;

  // Fetch USDT balance
  const { data: usdtBalance } = useReadContract({
    address: usdtAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const formattedBalance = usdtBalance
    ? formatUnits(usdtBalance as bigint, USDT_DECIMALS)
    : "0";

  const handleSubmitPayrollGasless = async () => {
    if (!payrollData || !address || !walletClient) return;
    setProofStatus("submitting");
    setErrorMsg(null);
    setStatusMsg("Fetching escrow address...");

    try {
      const rawTotal = parseUnits(payrollData.total, USDT_DECIMALS);

      // Step 1: Get escrow address from backend
      const escrowAddress = await getEscrowAddress();
      console.log("Escrow address:", escrowAddress);

      // Step 2: Build EIP-3009 authorization
      setStatusMsg("Please sign the authorization...");
      const now = BigInt(Math.floor(Date.now() / 1000));
      const authorization: EIP3009Authorization = {
        from: address,
        to: escrowAddress as `0x${string}`,
        value: rawTotal,
        validAfter: now - 60n, // Valid from 1 minute ago (clock skew buffer)
        validBefore: now + 3600n, // Valid until 1 hour from now
        nonce: generateNonce(),
      };

      // Step 3: Sign EIP-712 typed data (gasless!)
      const signature = await walletClient.signTypedData({
        domain: USDT0_EIP712_DOMAIN,
        types: TRANSFER_WITH_AUTHORIZATION_TYPES,
        primaryType: "TransferWithAuthorization",
        message: authorization,
      });
      console.log("Signature obtained:", signature.slice(0, 20) + "...");

      // Step 4: Submit to backend
      setStatusMsg("Creating payroll (this may take ~30s)...");
      const result = await createPayrollGasless({
        recipients: payrollData.recipients,
        amounts: payrollData.amounts.map((a) => parseUnits(a, USDT_DECIMALS).toString()),
        totalAmount: rawTotal.toString(),
        employer: address,
        authorization: {
          from: authorization.from,
          to: authorization.to,
          value: authorization.value.toString(),
          validAfter: authorization.validAfter.toString(),
          validBefore: authorization.validBefore.toString(),
          nonce: authorization.nonce,
        },
        signature,
      });

      console.log("Payroll created:", result);
      setTxHash(result.txHash);
      setClaimCredentials(result.claimCredentials || []);
      setProofStatus("complete");
      setStatusMsg(null);
    } catch (e: any) {
      console.error("Gasless payroll error:", e);
      setErrorMsg(e?.shortMessage || e?.message || "Gasless payroll creation failed");
      setProofStatus("ready");
      setStatusMsg(null);
    }
  };

  const handleReset = () => {
    setPayrollData(null);
    setProofStatus("idle");
    setClaimCredentials([]);
    setTxHash(null);
    setErrorMsg(null);
  };

  return (
    <main className="min-h-screen bg-zk-bg text-zk-text">
      {/* Nav */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-zk-bg/70 border-b border-white/[0.06]">
        <div className="max-w-4xl mx-auto flex justify-between items-center px-6 h-16">
          <a href="/" className="flex items-center gap-2 no-underline">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <defs>
                <linearGradient id="coinGradCreate" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#00FFB2"/>
                  <stop offset="100%" stopColor="#00D395"/>
                </linearGradient>
              </defs>
              <circle cx="24" cy="24" r="20" fill="url(#coinGradCreate)"/>
              <circle cx="24" cy="24" r="10" fill="#0A0F0D"/>
              <path d="M4 16 L44 16 L44 28 L4 28 Z" fill="#003D29"/>
              <rect x="10" y="19" width="28" height="5" rx="1" fill="#00FFB2" opacity="0.9"/>
              <circle cx="17" cy="21.5" r="1.75" fill="#003D29"/>
              <circle cx="24" cy="21.5" r="1.75" fill="#003D29"/>
              <circle cx="31" cy="21.5" r="1.75" fill="#003D29"/>
            </svg>
            <span className="font-display font-bold text-lg text-zk-text">Private Payroll</span>
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
            {/* Top Bar: Balance + Claim */}
            <div className="flex items-center gap-4">
              {/* Balance Card */}
              <div className="flex-1 bg-zk-card rounded-2xl p-4 border border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-zk-dim text-xs font-display uppercase tracking-wider">Available Balance</p>
                    <p className="text-xl font-bold font-display tabular-nums">
                      {Number(formattedBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-zk-muted text-sm">USDT</span>
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-zk-dim text-xs font-display">Network</p>
                  <p className="text-zk-muted text-sm font-display">{chainId === 9746 ? "Plasma Testnet" : "Localhost"}</p>
                </div>
              </div>

              {/* Claim Button - Separate */}
              <a
                href="/claim"
                className="h-full px-5 py-4 bg-zk-accent hover:bg-zk-accent-hover rounded-2xl text-sm font-semibold transition-all text-zk-bg flex flex-col items-center justify-center gap-1 hover:-translate-y-px"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Claim</span>
              </a>
            </div>

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
                  setProofStatus("ready");
                  setClaimCredentials([]);
                  setTxHash(null);
                  setErrorMsg(null);
                }}
              />
            </section>

            {/* Step 2: Deposit & Create */}
            {proofStatus === "ready" && (
              <section className="bg-zk-card rounded-2xl p-6 border border-white/[0.06]">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-8 h-8 rounded-full bg-zk-accent/10 flex items-center justify-center text-zk-accent font-display font-bold text-sm">
                    2
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

                  <div className="flex items-center justify-between bg-zk-inset rounded-xl p-4 border border-white/[0.04]">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-zk-text">Gasless Pool Create</p>
                        <p className="text-xs text-zk-muted">Uses EIP-3009 funding + root registration</p>
                      </div>
                    </div>
                    <span className="text-xs text-zk-accent font-display uppercase tracking-wider">Enabled</span>
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
                    onClick={handleSubmitPayrollGasless}
                    className="w-full py-3 px-6 bg-zk-accent hover:bg-zk-accent-hover text-zk-bg rounded-xl font-semibold transition-all hover:-translate-y-px text-sm"
                  >
                    Sign & Create Payroll (Gasless)
                  </button>
                </div>
              </section>
            )}

            {/* Submitting state */}
            {proofStatus === "submitting" && (
              <section className="bg-zk-card rounded-2xl p-6 border border-white/[0.06]">
                <div className="text-center py-6">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-zk-accent border-t-transparent mb-4"></div>
                  <p className="text-zk-text text-sm">{statusMsg || "Processing..."}</p>
                  <p className="text-zk-dim text-xs mt-1">Gasless transaction via Plasma relayer</p>
                </div>
              </section>
            )}

            {/* Step 3: Share Credentials */}
            {proofStatus === "complete" && (
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
                      3
                    </div>
                    <h2 className="font-display text-lg font-semibold tracking-tight">Share Claim Links</h2>
                  </div>
                  <ClaimCredentials
                    credentials={claimCredentials}
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
