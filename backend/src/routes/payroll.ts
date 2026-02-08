/**
 * Payroll API Routes (Pool V1)
 * Handles gasless payroll funding + root registration + claim token issuance.
 */

import { randomBytes } from "crypto";
import { Hono } from "hono";
import type { Address, Hex } from "viem";
import { getEscrowAddress } from "../lib/escrow";
import { submitZeroFeeTransfer, waitForConfirmation } from "../lib/relayer";
import type { EIP3009Authorization } from "../lib/escrow";
import {
  registerRootOnChain,
  waitForReceipt,
} from "../lib/contract";
import { createClaimToken } from "../lib/claimToken";
import { computeMerkleProof, computeMerkleRoot } from "../lib/merkle";
import { generateRandomFieldElement, poseidonHash } from "../lib/poseidon";
import { query, withAdvisoryLock, withTransaction } from "../lib/db";

const payroll = new Hono();
const MERKLE_DEPTH = Number(process.env.MERKLE_DEPTH || "20");
const PAYROLL_CREATE_LOCK_KEY = 73001;

interface CreatePayrollRequest {
  recipients: Address[];
  amounts: string[]; // raw token units
  totalAmount: string;
  employer: Address;
  authorization: {
    from: Address;
    to: Address;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: Hex;
  };
  signature: Hex;
}

interface GeneratedNote {
  recipient: Address;
  amount: bigint;
  secret: bigint;
  nullifier: bigint;
  nullifierHash: bigint;
  commitment: bigint;
  leafIndex: number;
  pathElements: bigint[];
  pathIndices: number[];
  claimTokenId: string;
  claimToken: string;
}

function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "127.0.0.1"
  );
}

function makeBytes32FromRandom(): Hex {
  return `0x${randomBytes(32).toString("hex")}`;
}

function makeClaimTokenId(): string {
  return `ctid_${Date.now()}_${randomBytes(10).toString("hex")}`;
}

async function loadExistingCommitments(): Promise<bigint[]> {
  const result = await query<{ commitment: string }>(
    "SELECT commitment FROM notes ORDER BY leaf_index ASC"
  );
  return result.rows.map((r) => BigInt(r.commitment));
}

async function buildNotes(
  recipients: Address[],
  amounts: string[],
  existingCommitments: bigint[]
): Promise<GeneratedNote[]> {
  const notes: Omit<GeneratedNote, "pathElements" | "pathIndices">[] = [];
  const newCommitments: bigint[] = [];

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i].toLowerCase() as Address;
    const amount = BigInt(amounts[i]);
    const secret = generateRandomFieldElement();
    const nullifier = generateRandomFieldElement();
    const nullifierHash = await poseidonHash([nullifier]);
    const commitment = await poseidonHash([amount, secret, nullifier]);
    const leafIndex = existingCommitments.length + i;
    const claimTokenId = makeClaimTokenId();
    const claimToken = createClaimToken({ claimTokenId, recipient });

    notes.push({
      recipient,
      amount,
      secret,
      nullifier,
      nullifierHash,
      commitment,
      leafIndex,
      claimTokenId,
      claimToken,
    });
    newCommitments.push(commitment);
  }

  const fullLeaves = [...existingCommitments, ...newCommitments];
  const withPaths: GeneratedNote[] = [];

  for (const note of notes) {
    const proof = await computeMerkleProof(fullLeaves, MERKLE_DEPTH, note.leafIndex);
    withPaths.push({
      ...note,
      pathElements: proof.pathElements,
      pathIndices: proof.pathIndices,
    });
  }

  return withPaths;
}

/**
 * GET /api/payroll/escrow
 */
payroll.get("/escrow", (c) => {
  try {
    return c.json({ address: getEscrowAddress() });
  } catch (error) {
    console.error("[payroll/escrow] error:", error);
    return c.json({ error: "Failed to get escrow address" }, 500);
  }
});

/**
 * POST /api/payroll/create
 *
 * Flow:
 * 1. Use employer's EIP-3009 signature (employer -> escrow)
 * 2. Wait transfer confirmation
 * 3. Generate notes and global merkle root off-chain
 * 4. Register root on-chain
 * 5. Persist batch + notes to Postgres
 * 6. Return claim tokens and links
 */
payroll.post("/create", async (c) => {
  try {
    const body = await c.req.json() as CreatePayrollRequest;
    const { recipients, amounts, totalAmount, employer, authorization, signature } = body;

    if (!recipients?.length || !amounts?.length || recipients.length !== amounts.length) {
      return c.json({ error: "Recipients and amounts are required and must match in length" }, 400);
    }
    if (!totalAmount || !authorization || !signature || !employer) {
      return c.json({ error: "Missing required authorization or payroll fields" }, 400);
    }

    const escrowAddress = getEscrowAddress();
    if (authorization.from.toLowerCase() !== employer.toLowerCase()) {
      return c.json({ error: "Authorization signer must match employer" }, 400);
    }
    if (authorization.to.toLowerCase() !== escrowAddress.toLowerCase()) {
      return c.json({ error: "Authorization must target escrow address" }, 400);
    }
    if (authorization.value !== totalAmount) {
      return c.json({ error: "Authorization value must match totalAmount" }, 400);
    }

    const userIp = getClientIp(c);
    const eip3009Auth: EIP3009Authorization = {
      from: authorization.from,
      to: authorization.to,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce,
    };

    console.log("[payroll/create] Submitting employer funding to relayer...");
    const relayerResult = await submitZeroFeeTransfer(userIp, eip3009Auth, signature);

    console.log("[payroll/create] Waiting for employer funding confirmation...");
    const transferResult = await waitForConfirmation(userIp, relayerResult.authorizationId);
    if (transferResult.status !== "confirmed") {
      return c.json({
        error: "Employer funding transfer failed",
        details: transferResult.error || "Unknown relayer failure",
      }, 400);
    }

    const recipientAmounts = amounts.map((a) => BigInt(a));
    const sum = recipientAmounts.reduce((acc, v) => acc + v, 0n);
    if (sum !== BigInt(totalAmount)) {
      return c.json({ error: "Total amount does not match recipient sum" }, 400);
    }

    const { notes, finalRoot, batchId, registerTxHash } = await withAdvisoryLock(
      PAYROLL_CREATE_LOCK_KEY,
      async () => {
        const existingCommitments = await loadExistingCommitments();
        const notes = await buildNotes(recipients, amounts, existingCommitments);
        const finalRoot = await computeMerkleRoot(
          [...existingCommitments, ...notes.map((n) => n.commitment)],
          MERKLE_DEPTH
        );

        const batchId = makeBytes32FromRandom();
        console.log("[payroll/create] Registering root on-chain...");
        const registerTxHash = await registerRootOnChain(
          finalRoot,
          batchId,
          notes.length,
          BigInt(totalAmount)
        );
        await waitForReceipt(registerTxHash);

        await withTransaction(async (tx) => {
          await tx.query(
            `
              INSERT INTO batches (
                batch_id, employer_address, total_amount, note_count, root,
                cumulative_leaf_count, funding_authorization_id, funding_tx_hash, register_tx_hash, status
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'registered')
            `,
            [
              batchId,
              employer.toLowerCase(),
              totalAmount,
              notes.length,
              finalRoot.toString(),
              existingCommitments.length + notes.length,
              relayerResult.authorizationId,
              transferResult.txHash || null,
              registerTxHash,
            ]
          );

          for (const note of notes) {
            await tx.query(
              `
                INSERT INTO notes (
                  batch_id, recipient, amount, secret, nullifier, nullifier_hash, commitment,
                  leaf_index, root, path_elements, path_indices, claim_token_id, spent
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, false)
              `,
              [
                batchId,
                note.recipient,
                note.amount.toString(),
                note.secret.toString(),
                note.nullifier.toString(),
                note.nullifierHash.toString(),
                note.commitment.toString(),
                note.leafIndex,
                finalRoot.toString(),
                JSON.stringify(note.pathElements.map((x) => x.toString())),
                JSON.stringify(note.pathIndices.map((x) => x.toString())),
                note.claimTokenId,
              ]
            );
          }
        });

        return { notes, finalRoot, batchId, registerTxHash };
      }
    );

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const claimCredentials = notes.map((note) => ({
      recipient: note.recipient,
      amount: note.amount.toString(),
      commitment: note.commitment.toString(),
      nullifierHash: note.nullifierHash.toString(),
      claimToken: note.claimToken,
      claimUrl: `${frontendUrl}/claim?ct=${encodeURIComponent(note.claimToken)}`,
    }));

    return c.json({
      success: true,
      batchId,
      root: finalRoot.toString(),
      txHash: registerTxHash,
      transferTxHash: transferResult.txHash,
      claimCredentials,
    });
  } catch (error) {
    console.error("[payroll/create] error:", error);
    return c.json({
      error: "Payroll creation failed",
      details: String(error),
    }, 500);
  }
});

export default payroll;
