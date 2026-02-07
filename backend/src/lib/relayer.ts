/**
 * Plasma Zero-Fee Relayer Integration
 * Server-side version with API key handling
 */

import type { Address, Hex } from "viem";
import type { EIP3009Authorization } from "./escrow";

const RELAYER_API = "https://dev.api.relayer.plasma.to";

export interface ZeroFeeTransferResult {
  authorizationId: string;
  status: "queued" | "pending" | "submitted" | "confirmed" | "failed";
  txHash?: string;
  error?: string;
}

/**
 * Submit a signed zero-fee transfer to the Plasma relayer
 */
export async function submitZeroFeeTransfer(
  userIp: string,
  authorization: EIP3009Authorization,
  signature: Hex
): Promise<ZeroFeeTransferResult> {
  const apiKey = process.env.PLASMA_RELAYER_API_KEY;
  if (!apiKey) {
    throw new Error("PLASMA_RELAYER_API_KEY not set");
  }

  const response = await fetch(`${RELAYER_API}/v1/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
      "X-User-IP": userIp,
    },
    body: JSON.stringify({
      authorization: {
        from: authorization.from,
        to: authorization.to,
        value: authorization.value.toString(),
        validAfter: authorization.validAfter.toString(),
        validBefore: authorization.validBefore.toString(),
        nonce: authorization.nonce,
      },
      signature,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: "Unknown error" } }));
    throw new Error(error.error?.message || `Relayer error: ${response.status}`);
  }

  return response.json();
}

/**
 * Check the status of a zero-fee transfer
 */
export async function checkTransferStatus(
  userIp: string,
  authorizationId: string
): Promise<ZeroFeeTransferResult> {
  const apiKey = process.env.PLASMA_RELAYER_API_KEY;
  if (!apiKey) {
    throw new Error("PLASMA_RELAYER_API_KEY not set");
  }

  const response = await fetch(`${RELAYER_API}/v1/status/${authorizationId}`, {
    headers: {
      "X-Api-Key": apiKey,
      "X-User-IP": userIp,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: "Unknown error" } }));
    throw new Error(error.error?.message || `Relayer error: ${response.status}`);
  }

  return response.json();
}

/**
 * Poll for transfer confirmation with exponential backoff
 */
export async function waitForConfirmation(
  userIp: string,
  authorizationId: string,
  maxAttempts = 20
): Promise<ZeroFeeTransferResult> {
  let delay = 1000; // Start at 1 second
  const maxDelay = 10000; // Cap at 10 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await checkTransferStatus(userIp, authorizationId);

    if (status.status === "confirmed" || status.status === "failed") {
      return status;
    }

    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.5, maxDelay);
  }

  throw new Error("Transfer confirmation timeout");
}
