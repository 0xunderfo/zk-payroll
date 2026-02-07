/**
 * ZK Proof generation for private payroll (v2.1)
 * Uses Poseidon commitments for real privacy
 * Supports deterministic salt derivation from master secret
 */

// @ts-ignore - snarkjs doesn't have proper types
import * as snarkjs from "snarkjs";

const CIRCUIT_WASM_PATH = "/circuits/payroll_private.wasm";
const CIRCUIT_ZKEY_PATH = "/circuits/circuit_final.zkey";
const MAX_RECIPIENTS = 5;

export interface ClaimCredential {
  payrollId?: number;
  commitmentIndex: number;
  recipient: string;
  amount: string; // raw units (6 decimals)
  salt: string;
  commitment: string;
}

export interface PrivatePayrollProof {
  proof: bigint[]; // uint256[8] for Solidity
  publicSignals: string[];
  commitments: string[]; // 5 Poseidon hashes
  claimCredentials: ClaimCredential[];
}

// Poseidon instance cache
let poseidonInstance: any = null;
let poseidonF: any = null;

async function getPoseidon() {
  if (!poseidonInstance) {
    // @ts-ignore - circomlibjs doesn't have type declarations
    const { buildPoseidon } = await import("circomlibjs");
    poseidonInstance = await buildPoseidon();
    poseidonF = poseidonInstance.F;
  }
  return { poseidon: poseidonInstance, F: poseidonF };
}

/**
 * Generate a random field element (31 bytes to stay within BN254 field)
 */
function generateRandomSalt(): bigint {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  let hex = "0x";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return BigInt(hex);
}

/**
 * Derive a deterministic salt from master secret + recipient + identifier
 * This allows employers to regenerate salts without storing them
 *
 * @param masterSecret - Employer's secret (keep private!)
 * @param recipient - Recipient address
 * @param identifier - Payroll identifier (e.g., "2026-02", payrollId, or month string)
 * @returns Deterministic salt as bigint
 *
 * @example
 * // Derive salt for February 2026 payroll
 * const salt = await deriveSalt("my-secret-key", "0x1234...", "2026-02");
 *
 * // Or use payroll ID
 * const salt = await deriveSalt("my-secret-key", "0x1234...", "payroll-42");
 */
export async function deriveSalt(
  masterSecret: string,
  recipient: string,
  identifier: string
): Promise<bigint> {
  const { poseidon, F } = await getPoseidon();

  // Convert masterSecret string to a field element via keccak-like hashing
  // We hash the string bytes to get a deterministic number
  const secretBytes = new TextEncoder().encode(masterSecret);
  const secretHash = await crypto.subtle.digest("SHA-256", secretBytes);
  const secretBigInt = BigInt("0x" + Array.from(new Uint8Array(secretHash)).map(b => b.toString(16).padStart(2, "0")).join(""));

  // Convert identifier to field element
  const idBytes = new TextEncoder().encode(identifier);
  const idHash = await crypto.subtle.digest("SHA-256", idBytes);
  const idBigInt = BigInt("0x" + Array.from(new Uint8Array(idHash)).map(b => b.toString(16).padStart(2, "0")).join(""));

  // Poseidon(secret, recipient, identifier) -> deterministic salt
  const recipientBigInt = BigInt(recipient);
  const hash = poseidon([secretBigInt, recipientBigInt, idBigInt]);

  return F.toObject(hash);
}

/**
 * Derive salts for multiple recipients in a batch
 *
 * @param masterSecret - Employer's secret
 * @param recipients - Array of recipient addresses
 * @param identifier - Payroll identifier (e.g., "2026-02")
 * @returns Array of salts (same order as recipients)
 */
export async function deriveSaltsForPayroll(
  masterSecret: string,
  recipients: string[],
  identifier: string
): Promise<bigint[]> {
  const salts: bigint[] = [];
  for (const recipient of recipients) {
    salts.push(await deriveSalt(masterSecret, recipient, identifier));
  }
  return salts;
}

export interface PayrollProofOptions {
  /** If provided, derive salts deterministically instead of randomly */
  masterSecret?: string;
  /** Identifier for salt derivation (e.g., "2026-02", "payroll-42") */
  payrollIdentifier?: string;
}

/**
 * Generate a private payroll proof with Poseidon commitments
 * @param recipients - Array of recipient addresses
 * @param amounts - Array of payment amounts in raw units (6 decimals)
 * @param totalAmount - Total of all amounts in raw units
 * @param options - Optional: use deterministic salts via masterSecret + payrollIdentifier
 *
 * @example
 * // With random salts (default)
 * const proof = await generatePrivatePayrollProof(recipients, amounts, total);
 *
 * // With deterministic salts (recommended for production)
 * const proof = await generatePrivatePayrollProof(recipients, amounts, total, {
 *   masterSecret: "employer-secret-key",
 *   payrollIdentifier: "2026-02"
 * });
 */
export async function generatePrivatePayrollProof(
  recipients: string[],
  amounts: string[],
  totalAmount: string,
  options?: PayrollProofOptions
): Promise<PrivatePayrollProof> {
  const activeCount = recipients.length;
  const { poseidon, F } = await getPoseidon();

  // Pad arrays to MAX_RECIPIENTS
  const paddedRecipients: string[] = [...recipients];
  const paddedAmounts: string[] = [...amounts];
  let salts: bigint[] = [];

  // Generate or derive salts for active recipients
  if (options?.masterSecret && options?.payrollIdentifier) {
    // Deterministic salts from master secret
    salts = await deriveSaltsForPayroll(
      options.masterSecret,
      recipients,
      options.payrollIdentifier
    );
  } else {
    // Random salts
    for (let i = 0; i < activeCount; i++) {
      salts.push(generateRandomSalt());
    }
  }

  // Pad with zeros
  while (paddedRecipients.length < MAX_RECIPIENTS) {
    paddedRecipients.push("0x0000000000000000000000000000000000000000");
    paddedAmounts.push("0");
    salts.push(0n);
  }

  // Convert addresses to field elements
  const recipientValues = paddedRecipients.map((addr) =>
    BigInt(addr).toString()
  );

  // Compute Poseidon commitments
  const commitments: string[] = [];
  for (let i = 0; i < MAX_RECIPIENTS; i++) {
    const hash = poseidon([
      BigInt(recipientValues[i]),
      BigInt(paddedAmounts[i]),
      salts[i],
    ]);
    commitments.push(F.toObject(hash).toString());
  }

  // Build circuit input (v2.1: no activeCount)
  const input = {
    totalAmount: totalAmount,
    commitments: commitments,
    recipients: recipientValues,
    amounts: paddedAmounts,
    salts: salts.map((s) => s.toString()),
  };

  console.log("Generating proof with input:", {
    totalAmount: input.totalAmount,
    commitmentsCount: commitments.length,
    usingDerivedSalts: !!(options?.masterSecret && options?.payrollIdentifier),
  });

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    CIRCUIT_WASM_PATH,
    CIRCUIT_ZKEY_PATH
  );

  console.log("Proof generated successfully");
  console.log("Public signals:", publicSignals);

  // Format proof for Solidity
  // snarkjs proof: { pi_a: [x, y, 1], pi_b: [[x1, x2], [y1, y2], [1, 0]], pi_c: [x, y, 1] }
  // Solidity: uint256[8] = [a.x, a.y, b[0][1], b[0][0], b[1][1], b[1][0], c.x, c.y]
  // IMPORTANT: b coordinates are swapped for BN254 pairing precompile
  const solidityProof: bigint[] = [
    BigInt(proof.pi_a[0]),
    BigInt(proof.pi_a[1]),
    BigInt(proof.pi_b[0][1]),
    BigInt(proof.pi_b[0][0]),
    BigInt(proof.pi_b[1][1]),
    BigInt(proof.pi_b[1][0]),
    BigInt(proof.pi_c[0]),
    BigInt(proof.pi_c[1]),
  ];

  // Build claim credentials for each active recipient
  const claimCredentials: ClaimCredential[] = [];
  for (let i = 0; i < activeCount; i++) {
    claimCredentials.push({
      commitmentIndex: i,
      recipient: recipients[i],
      amount: amounts[i],
      salt: salts[i].toString(),
      commitment: commitments[i],
    });
  }

  return {
    proof: solidityProof,
    publicSignals,
    commitments,
    claimCredentials,
  };
}
