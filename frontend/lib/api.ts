/**
 * Backend API Client
 * Handles communication with zero-fee claim backend
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

export interface VerifyClaimResponse {
  valid: boolean;
  claimed: boolean;
  escrowAddress: string;
}

export interface ZeroFeeClaimResponse {
  claimId: string;
  authorizationId: string;
  status: "submitted";
  message: string;
}

export interface ClaimStatusResponse {
  claimId: string;
  status: "pending" | "submitted" | "confirmed" | "failed";
  txHash?: string;
  error?: string;
  recipient: string;
  amount: string;
}

/**
 * Verify a claim is valid before submitting
 */
export async function verifyClaim(
  payrollId: string,
  commitmentIndex: string,
  recipient: string,
  amount: string,
  salt: string
): Promise<VerifyClaimResponse> {
  const response = await fetch(`${BACKEND_URL}/api/claim/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payrollId,
      commitmentIndex,
      recipient,
      amount,
      salt,
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
  payrollId: string,
  commitmentIndex: string,
  recipient: string,
  amount: string,
  salt: string
): Promise<ZeroFeeClaimResponse> {
  const response = await fetch(`${BACKEND_URL}/api/claim/zero-fee`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payrollId,
      commitmentIndex,
      recipient,
      amount,
      salt,
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
