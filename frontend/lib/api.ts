/**
 * Backend API Client
 * Handles communication with zero-fee claim backend
 */

import type { ClaimCredential } from "./types";
export type { ClaimCredential };

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

export interface VerifyClaimResponse {
  valid: boolean;
  claimed: boolean;
  amount?: string;
  recipient?: string;
  root?: string;
  error?: string;
}

export interface ZeroFeeClaimResponse {
  claimId: string;
  authorizationId: string;
  status: "submitted";
  message: string;
}

export interface ClaimStatusResponse {
  claimId: string;
  status: "submitted" | "confirmed" | "failed";
  txHash?: string;
  error?: string;
  nullifierHash?: string;
  requestHash?: string;
}

/**
 * Verify a claim is valid before submitting
 */
export async function verifyClaim(
  claimToken: string,
  recipient: string,
): Promise<VerifyClaimResponse> {
  const response = await fetch(`${BACKEND_URL}/api/claim/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      claimToken,
      recipient,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || "Verification failed");
  }

  return response.json();
}

/**
 * Submit a zero-fee claim via the backend
 */
export async function submitZeroFeeClaim(
  claimToken: string,
  recipient: string,
): Promise<ZeroFeeClaimResponse> {
  const response = await fetch(`${BACKEND_URL}/api/claim/zero-fee`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      claimToken,
      recipient,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || "Claim submission failed");
  }

  return response.json();
}

/**
 * Check the status of a zero-fee claim
 */
export async function getClaimStatus(claimId: string): Promise<ClaimStatusResponse> {
  const response = await fetch(`${BACKEND_URL}/api/claim/status/${claimId}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || "Status check failed");
  }

  return response.json();
}

/**
 * Poll for claim confirmation
 */
export async function waitForClaimConfirmation(
  claimId: string,
  maxAttempts = 30,
  intervalMs = 2000
): Promise<ClaimStatusResponse> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await getClaimStatus(claimId);

    if (status.status === "confirmed" || status.status === "failed") {
      return status;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Claim confirmation timeout");
}

/**
 * Check if backend is available
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Gasless payroll creation types
export interface EscrowAddressResponse {
  address: string;
}

export interface CreatePayrollGaslessRequest {
  recipients: string[];
  amounts: string[];
  totalAmount: string;
  employer: string;
  authorization: {
    from: string;
    to: string;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: string;
  };
  signature: string;
}

export interface CreatePayrollGaslessResponse {
  success: boolean;
  batchId: string;
  root: string;
  txHash: string;
  transferTxHash?: string;
  claimCredentials: Array<ClaimCredential & {
    claimToken: string;
    claimUrl: string;
    nullifierHash?: string;
  }>;
}

/**
 * Get escrow address for EIP-3009 authorization
 */
export async function getEscrowAddress(): Promise<string> {
  const response = await fetch(`${BACKEND_URL}/api/payroll/escrow`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || "Failed to get escrow address");
  }

  const data: EscrowAddressResponse = await response.json();
  return data.address;
}

/**
 * Create payroll via gasless flow (EIP-3009 signature + backend relay)
 */
export async function createPayrollGasless(
  request: CreatePayrollGaslessRequest
): Promise<CreatePayrollGaslessResponse> {
  const response = await fetch(`${BACKEND_URL}/api/payroll/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || "Payroll creation failed");
  }

  return response.json();
}

/**
 * Generate a random 32-byte nonce for EIP-3009
 */
export function generateNonce(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return ("0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
}
