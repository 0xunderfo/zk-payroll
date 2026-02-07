/**
 * Claim API Routes
 * Handles zero-fee claim verification and processing
 */

import { Hono } from "hono";
import type { Address } from "viem";
import { verifyClaim, isClaimed, markClaimedZeroFee } from "../lib/contract";
import { signAuthorization, getEscrowAddress } from "../lib/escrow";
import { submitZeroFeeTransfer, waitForConfirmation, checkTransferStatus } from "../lib/relayer";

const claim = new Hono();

// In-memory store for pending claims (in production, use Redis/DB)
const pendingClaims = new Map<
  string,
  {
    payrollId: bigint;
    commitmentIndex: bigint;
    recipient: Address;
    amount: bigint;
    salt: bigint;
    authorizationId?: string;
    status: "pending" | "submitted" | "confirmed" | "failed";
    txHash?: string;
    error?: string;
    createdAt: number;
  }
>();

/**
 * Generate a unique claim ID
 */
function generateClaimId(): string {
  return `claim_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Get client IP from request headers
 */
function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "127.0.0.1"
  );
}

/**
 * POST /api/claim/verify
 * Verify a claim is valid on-chain without executing
 */
claim.post("/verify", async (c) => {
  try {
    const body = await c.req.json();
    const { payrollId, commitmentIndex, recipient, amount, salt } = body;

    // Validate inputs
    if (
      payrollId === undefined ||
      commitmentIndex === undefined ||
      !recipient ||
      !amount ||
      !salt
    ) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const isValid = await verifyClaim(
      BigInt(payrollId),
      BigInt(commitmentIndex),
      recipient as Address,
      BigInt(amount),
      BigInt(salt)
    );

    const claimed = await isClaimed(BigInt(payrollId), BigInt(commitmentIndex));

    return c.json({
      valid: isValid,
      claimed,
      escrowAddress: getEscrowAddress(),
    });
  } catch (error) {
    console.error("Verify error:", error);
    return c.json({ error: "Verification failed", details: String(error) }, 500);
  }
});

/**
 * POST /api/claim/zero-fee
 * Process a zero-fee claim via Plasma relayer
 */
claim.post("/zero-fee", async (c) => {
  try {
    const body = await c.req.json();
    const { payrollId, commitmentIndex, recipient, amount, salt } = body;

    // Validate inputs
    if (
      payrollId === undefined ||
      commitmentIndex === undefined ||
      !recipient ||
      !amount ||
      !salt
    ) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const payrollIdBn = BigInt(payrollId);
    const commitmentIndexBn = BigInt(commitmentIndex);
    const recipientAddr = recipient as Address;
    const amountBn = BigInt(amount);
    const saltBn = BigInt(salt);

    // 1. Verify claim on-chain
    const isValid = await verifyClaim(
      payrollIdBn,
      commitmentIndexBn,
      recipientAddr,
      amountBn,
      saltBn
    );

    if (!isValid) {
      return c.json({ error: "Invalid claim" }, 400);
    }

    // 2. Check not already claimed
    const claimed = await isClaimed(payrollIdBn, commitmentIndexBn);
    if (claimed) {
      return c.json({ error: "Already claimed" }, 400);
    }

    // 3. Sign EIP-3009 authorization from escrow to recipient
    const { authorization, signature } = await signAuthorization(recipientAddr, amountBn);

    // 4. Submit to Plasma relayer
    const userIp = getClientIp(c);
    const relayerResult = await submitZeroFeeTransfer(userIp, authorization, signature);

    // 5. Create pending claim record
    const claimId = generateClaimId();
    pendingClaims.set(claimId, {
      payrollId: payrollIdBn,
      commitmentIndex: commitmentIndexBn,
      recipient: recipientAddr,
      amount: amountBn,
      salt: saltBn,
      authorizationId: relayerResult.authorizationId,
      status: "submitted",
      createdAt: Date.now(),
    });

    // 6. Wait for confirmation in background and mark claimed
    processClaimConfirmation(claimId, userIp).catch(console.error);

    return c.json({
      claimId,
      authorizationId: relayerResult.authorizationId,
      status: "submitted",
      message: "Claim submitted. Check /api/claim/status/:id for updates.",
    });
  } catch (error) {
    console.error("Zero-fee claim error:", error);
    return c.json({ error: "Claim failed", details: String(error) }, 500);
  }
});

/**
 * Background process to wait for confirmation and mark claimed
 */
async function processClaimConfirmation(claimId: string, userIp: string) {
  const claim = pendingClaims.get(claimId);
  if (!claim || !claim.authorizationId) return;

  try {
    // Wait for relayer confirmation
    const result = await waitForConfirmation(userIp, claim.authorizationId);

    if (result.status === "confirmed") {
      // Mark claimed on contract
      const txHash = await markClaimedZeroFee(
        claim.payrollId,
        claim.commitmentIndex,
        claim.recipient,
        claim.amount,
        claim.salt
      );

      claim.status = "confirmed";
      claim.txHash = result.txHash || txHash;
      pendingClaims.set(claimId, claim);
    } else {
      claim.status = "failed";
      claim.error = result.error || "Transfer failed";
      pendingClaims.set(claimId, claim);
    }
  } catch (error) {
    claim.status = "failed";
    claim.error = String(error);
    pendingClaims.set(claimId, claim);
  }
}

/**
 * GET /api/claim/status/:id
 * Check the status of a claim
 */
claim.get("/status/:id", async (c) => {
  const claimId = c.req.param("id");
  const claim = pendingClaims.get(claimId);

  if (!claim) {
    return c.json({ error: "Claim not found" }, 404);
  }

  return c.json({
    claimId,
    status: claim.status,
    txHash: claim.txHash,
    error: claim.error,
    recipient: claim.recipient,
    amount: claim.amount.toString(),
  });
});

export default claim;
