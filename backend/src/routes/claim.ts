/**
 * Claim API Routes (Pool V1)
 */

import { Hono } from "hono";
import type { Address, Hex } from "viem";
import { keccak256, stringToHex } from "viem";
import {
  cancelReservedWithdrawalOnChain,
  computeRequestHashOnChain,
  finalizeZeroFeeWithdrawalOnChain,
  reserveZeroFeeWithdrawalOnChain,
  verifyWithdrawalOnChain,
} from "../lib/contract";
import { decodeClaimToken } from "../lib/claimToken";
import { computeRequestHash } from "../lib/poseidon";
import { signAuthorization } from "../lib/escrow";
import { submitZeroFeeTransfer, waitForConfirmation } from "../lib/relayer";
import { query } from "../lib/db";
import { generateWithdrawProof } from "../lib/withdrawProof";

const claim = new Hono();

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const RELAYER_PAYOUT_ADDRESS =
  (process.env.RELAYER_PAYOUT_ADDRESS as Address | undefined)?.toLowerCase() as Address || ZERO_ADDRESS;
const WITHDRAW_FEE = BigInt(process.env.WITHDRAW_FEE || "0");

interface NoteRow {
  id: number;
  recipient: string;
  amount: string;
  secret: string;
  nullifier: string;
  nullifier_hash: string;
  root: string;
  path_elements: unknown;
  path_indices: unknown;
  spent: boolean;
}

interface ClaimRow {
  claim_id: string;
  note_id: number;
  nullifier_hash: string;
  request_hash: string;
  authorization_id: string | null;
  authorization_hash: string | null;
  user_ip: string | null;
  status: "submitted" | "confirmed" | "failed";
  relayer_tx_hash: string | null;
  finalize_tx_hash: string | null;
  error: string | null;
}

function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "127.0.0.1"
  );
}

function generateClaimId(): string {
  return `claim_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function ensureStringArray(input: unknown, name: string): string[] {
  if (!Array.isArray(input)) {
    throw new Error(`Invalid ${name}`);
  }
  return input.map((v) => String(v));
}

function toReasonHash(reason: string): Hex {
  return keccak256(stringToHex(reason));
}

function asBytes32(input: string): Hex {
  if (/^0x[0-9a-fA-F]{64}$/.test(input)) {
    return input as Hex;
  }
  return keccak256(stringToHex(input));
}

async function getNoteByClaimTokenId(claimTokenId: string): Promise<NoteRow | null> {
  const result = await query<NoteRow>(
    `
      SELECT id, recipient, amount, secret, nullifier, nullifier_hash, root,
             path_elements, path_indices, spent
      FROM notes
      WHERE claim_token_id = $1
      LIMIT 1
    `,
    [claimTokenId]
  );
  return result.rows[0] ?? null;
}

async function processClaimConfirmation(claimId: string, userIp: string) {
  const claimResult = await query<ClaimRow>(
    `
      SELECT claim_id, note_id, nullifier_hash, request_hash, authorization_id,
             authorization_hash, user_ip, status, relayer_tx_hash, finalize_tx_hash, error
      FROM claims
      WHERE claim_id = $1
      LIMIT 1
    `,
    [claimId]
  );
  const claimRow = claimResult.rows[0];
  if (!claimRow || claimRow.status !== "submitted") return;
  if (!claimRow.authorization_id || !claimRow.authorization_hash) return;

  const nullifierHash = BigInt(claimRow.nullifier_hash);
  const authorizationHash = asBytes32(claimRow.authorization_hash);

  try {
    const relayerStatus = await waitForConfirmation(userIp, claimRow.authorization_id);
    if (relayerStatus.status === "confirmed") {
      const finalizeTx = await finalizeZeroFeeWithdrawalOnChain(nullifierHash, authorizationHash);

      await query(
        `
          UPDATE notes
          SET spent = true, spent_at = NOW()
          WHERE id = $1
        `,
        [claimRow.note_id]
      );

      await query(
        `
          UPDATE claims
          SET status = 'confirmed',
              relayer_tx_hash = $2,
              finalize_tx_hash = $3,
              updated_at = NOW()
          WHERE claim_id = $1
        `,
        [claimId, relayerStatus.txHash || null, finalizeTx]
      );
    } else {
      await cancelReservedWithdrawalOnChain(
        nullifierHash,
        authorizationHash,
        toReasonHash(relayerStatus.error || "Relayer transfer failed")
      );

      await query(
        `
          UPDATE claims
          SET status = 'failed',
              error = $2,
              updated_at = NOW()
          WHERE claim_id = $1
        `,
        [claimId, relayerStatus.error || "Relayer transfer failed"]
      );
    }
  } catch (error) {
    const message = String(error);
    try {
      await cancelReservedWithdrawalOnChain(
        nullifierHash,
        authorizationHash,
        toReasonHash(message)
      );
    } catch (cancelErr) {
      console.error("[claim/confirm] cancel reservation error:", cancelErr);
    }

    await query(
      `
        UPDATE claims
        SET status = 'failed',
            error = $2,
            updated_at = NOW()
        WHERE claim_id = $1
      `,
      [claimId, message]
    );
  }
}

/**
 * POST /api/claim/verify
 * Verify token format + note availability.
 */
claim.post("/verify", async (c) => {
  try {
    const body = await c.req.json();
    const { claimToken, recipient } = body as { claimToken?: string; recipient?: string };
    if (!claimToken || !recipient) {
      return c.json({ error: "claimToken and recipient are required" }, 400);
    }

    const decoded = decodeClaimToken(claimToken);
    const note = await getNoteByClaimTokenId(decoded.claimTokenId);
    if (!note) {
      return c.json({ valid: false, claimed: false, error: "Claim not found" }, 404);
    }

    const normalizedRecipient = (recipient as Address).toLowerCase();
    const validRecipient =
      decoded.recipient.toLowerCase() === normalizedRecipient &&
      note.recipient.toLowerCase() === normalizedRecipient;

    return c.json({
      valid: validRecipient && !note.spent,
      claimed: note.spent,
      amount: note.amount,
      recipient: note.recipient,
      root: note.root,
    });
  } catch (error) {
    console.error("[claim/verify] error:", error);
    return c.json({ error: "Verification failed", details: String(error) }, 500);
  }
});

/**
 * POST /api/claim/zero-fee
 */
claim.post("/zero-fee", async (c) => {
  try {
    const body = await c.req.json();
    const { claimToken, recipient } = body as { claimToken?: string; recipient?: string };
    if (!claimToken || !recipient) {
      return c.json({ error: "claimToken and recipient are required" }, 400);
    }

    const recipientAddr = (recipient as Address).toLowerCase() as Address;
    const decoded = decodeClaimToken(claimToken);
    if (decoded.recipient.toLowerCase() !== recipientAddr) {
      return c.json({ error: "Claim token recipient mismatch" }, 403);
    }

    const note = await getNoteByClaimTokenId(decoded.claimTokenId);
    if (!note) {
      return c.json({ error: "Claim not found" }, 404);
    }
    if (note.spent) {
      return c.json({ error: "Already claimed" }, 400);
    }
    if (note.recipient.toLowerCase() !== recipientAddr) {
      return c.json({ error: "Wallet mismatch" }, 403);
    }

    const amount = BigInt(note.amount);
    if (WITHDRAW_FEE > amount) {
      return c.json({ error: "Configured withdraw fee exceeds amount" }, 500);
    }

    const root = BigInt(note.root);
    const nullifier = BigInt(note.nullifier);
    const nullifierHash = BigInt(note.nullifier_hash);
    const payoutAmount = amount - WITHDRAW_FEE;
    const requestHash = await computeRequestHash(
      root,
      nullifierHash,
      recipientAddr,
      RELAYER_PAYOUT_ADDRESS,
      WITHDRAW_FEE,
      amount
    );

    // Optional parity check with on-chain helper.
    const onChainRequestHash = await computeRequestHashOnChain(
      root,
      nullifierHash,
      recipientAddr,
      RELAYER_PAYOUT_ADDRESS,
      WITHDRAW_FEE,
      amount
    );
    if (onChainRequestHash !== requestHash) {
      return c.json({ error: "Request hash mismatch with contract" }, 500);
    }

    const pathElements = ensureStringArray(note.path_elements, "path_elements");
    const pathIndices = ensureStringArray(note.path_indices, "path_indices");

    const { proof, publicSignals } = await generateWithdrawProof({
      root: root.toString(),
      nullifierHash: nullifierHash.toString(),
      requestHash: requestHash.toString(),
      amount: amount.toString(),
      secret: note.secret,
      nullifier: nullifier.toString(),
      recipient: BigInt(recipientAddr).toString(),
      relayer: BigInt(RELAYER_PAYOUT_ADDRESS).toString(),
      fee: WITHDRAW_FEE.toString(),
      pathElements,
      pathIndices,
    });

    if (
      publicSignals.length < 3 ||
      BigInt(publicSignals[0]) !== root ||
      BigInt(publicSignals[1]) !== nullifierHash ||
      BigInt(publicSignals[2]) !== requestHash
    ) {
      return c.json({ error: "Generated proof public signals mismatch" }, 500);
    }

    const proofValid = await verifyWithdrawalOnChain(
      proof,
      root,
      nullifierHash,
      requestHash
    );
    if (!proofValid) {
      return c.json({ error: "Proof verification failed" }, 400);
    }

    const { authorization, signature } = await signAuthorization(recipientAddr, payoutAmount);
    const authorizationHash = asBytes32(authorization.nonce);

    await reserveZeroFeeWithdrawalOnChain(
      proof,
      root,
      nullifierHash,
      requestHash,
      authorizationHash
    );

    const userIp = getClientIp(c);
    let relayerResult: Awaited<ReturnType<typeof submitZeroFeeTransfer>>;
    try {
      relayerResult = await submitZeroFeeTransfer(userIp, authorization, signature);
    } catch (submitError) {
      await cancelReservedWithdrawalOnChain(
        nullifierHash,
        authorizationHash,
        toReasonHash(String(submitError))
      );
      throw submitError;
    }

    const createdClaimId = generateClaimId();
    const claimInsert = await query<{ claim_id: string }>(
      `
        INSERT INTO claims (
          claim_id, note_id, nullifier_hash, request_hash, authorization_id,
          authorization_hash, user_ip, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'submitted')
        ON CONFLICT (nullifier_hash)
        DO UPDATE SET
          note_id = EXCLUDED.note_id,
          request_hash = EXCLUDED.request_hash,
          authorization_id = EXCLUDED.authorization_id,
          authorization_hash = EXCLUDED.authorization_hash,
          user_ip = EXCLUDED.user_ip,
          status = 'submitted',
          relayer_tx_hash = NULL,
          finalize_tx_hash = NULL,
          error = NULL,
          updated_at = NOW()
        RETURNING claim_id
      `,
      [
        createdClaimId,
        note.id,
        nullifierHash.toString(),
        requestHash.toString(),
        relayerResult.authorizationId,
        authorizationHash,
        userIp,
      ]
    );
    const claimId = claimInsert.rows[0]?.claim_id ?? createdClaimId;

    processClaimConfirmation(claimId, userIp).catch((err) => {
      console.error("[claim/zero-fee] background confirmation error:", err);
    });

    return c.json({
      claimId,
      authorizationId: relayerResult.authorizationId,
      status: "submitted",
      message: "Claim submitted. Check /api/claim/status/:id for updates.",
    });
  } catch (error) {
    console.error("[claim/zero-fee] error:", error);
    return c.json({ error: "Claim failed", details: String(error) }, 500);
  }
});

/**
 * GET /api/claim/status/:id
 */
claim.get("/status/:id", async (c) => {
  try {
    const claimId = c.req.param("id");
    const result = await query<ClaimRow>(
      `
        SELECT claim_id, note_id, nullifier_hash, request_hash, authorization_id,
               authorization_hash, user_ip, status, relayer_tx_hash, finalize_tx_hash, error
        FROM claims
        WHERE claim_id = $1
        LIMIT 1
      `,
      [claimId]
    );
    const row = result.rows[0];
    if (!row) {
      return c.json({ error: "Claim not found" }, 404);
    }

    return c.json({
      claimId: row.claim_id,
      status: row.status,
      txHash: row.relayer_tx_hash || row.finalize_tx_hash || undefined,
      error: row.error || undefined,
      nullifierHash: row.nullifier_hash,
      requestHash: row.request_hash,
    });
  } catch (error) {
    console.error("[claim/status] error:", error);
    return c.json({ error: "Status check failed", details: String(error) }, 500);
  }
});

export default claim;

export async function resumePendingClaims() {
  const rows = await query<{ claim_id: string; user_ip: string | null }>(
    `
      SELECT claim_id, user_ip
      FROM claims
      WHERE status = 'submitted'
      ORDER BY created_at ASC
    `
  );

  for (const row of rows.rows) {
    processClaimConfirmation(row.claim_id, row.user_ip || "127.0.0.1").catch((err) => {
      console.error("[claim/resume] error for", row.claim_id, err);
    });
  }
}
