/**
 * Plasma Zero-Fee Relayer Integration
 * Handles EIP-3009 authorization signing and relayer API calls
 */

import { type Address, type Hex, encodePacked, keccak256 } from "viem";

const RELAYER_API = "https://api.relayer.plasma.to";
const USDT_ADDRESS = "0x..."; // TODO: Set Plasma USDT0 address
const CHAIN_ID = 9746; // Plasma testnet

// EIP-712 Domain for USDT0
const EIP712_DOMAIN = {
  name: "USD Token",
  version: "1",
  chainId: CHAIN_ID,
  verifyingContract: USDT_ADDRESS as Address,
};

// EIP-3009 ReceiveWithAuthorization type
const RECEIVE_WITH_AUTH_TYPE = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export interface ZeroFeeTransferRequest {
  from: Address;
  to: Address;
  value: string; // Amount in token units (6 decimals)
  validAfter?: string; // Unix timestamp, defaults to 0
  validBefore?: string; // Unix timestamp, defaults to 1 hour from now
  nonce?: Hex; // 32-byte nonce, auto-generated if not provided
}

export interface ZeroFeeTransferResult {
  authorizationId: string;
  status: "queued" | "pending" | "submitted" | "confirmed" | "failed";
  txHash?: string;
  error?: string;
}

/**
 * Generate a random 32-byte nonce for EIP-3009
 */
export function generateNonce(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return ("0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")) as Hex;
}

/**
 * Build EIP-712 typed data for signing
 */
export function buildTransferTypedData(request: ZeroFeeTransferRequest) {
  const now = Math.floor(Date.now() / 1000);
  const validAfter = request.validAfter ?? "0";
  const validBefore = request.validBefore ?? String(now + 3600); // 1 hour
  const nonce = request.nonce ?? generateNonce();

  return {
    domain: EIP712_DOMAIN,
    types: RECEIVE_WITH_AUTH_TYPE,
    primaryType: "ReceiveWithAuthorization" as const,
    message: {
      from: request.from,
      to: request.to,
      value: BigInt(request.value),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce: nonce,
    },
  };
}

/**
 * Submit a signed zero-fee transfer to the Plasma relayer
 *
 * @param apiKey - Your Plasma relayer API key
 * @param userIp - End user's IP address (for rate limiting)
 * @param authorization - The transfer authorization
 * @param signature - EIP-712 signature from the sender
 */
export async function submitZeroFeeTransfer(
  apiKey: string,
  userIp: string,
  authorization: {
    from: Address;
    to: Address;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: Hex;
  },
  signature: Hex
): Promise<ZeroFeeTransferResult> {
  const response = await fetch(`${RELAYER_API}/v1/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
      "X-User-IP": userIp,
    },
    body: JSON.stringify({
      authorization,
      signature,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Failed to submit transfer");
  }

  return response.json();
}

/**
 * Check the status of a zero-fee transfer
 */
export async function checkTransferStatus(
  apiKey: string,
  userIp: string,
  authorizationId: string
): Promise<ZeroFeeTransferResult> {
  const response = await fetch(`${RELAYER_API}/v1/status/${authorizationId}`, {
    headers: {
      "X-Api-Key": apiKey,
      "X-User-IP": userIp,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Failed to check status");
  }

  return response.json();
}

/**
 * Check if an address is rate limited
 */
export async function checkRateLimit(
  apiKey: string,
  userIp: string,
  address: Address
): Promise<{ isLimited: boolean; retryAfter?: string }> {
  const response = await fetch(
    `${RELAYER_API}/v1/rate-limit?address=${address}`,
    {
      headers: {
        "X-Api-Key": apiKey,
        "X-User-IP": userIp,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Failed to check rate limit");
  }

  return response.json();
}

/**
 * Poll for transfer confirmation with exponential backoff
 */
export async function waitForConfirmation(
  apiKey: string,
  userIp: string,
  authorizationId: string,
  maxAttempts = 20
): Promise<ZeroFeeTransferResult> {
  let delay = 1000; // Start at 1 second
  const maxDelay = 10000; // Cap at 10 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await checkTransferStatus(apiKey, userIp, authorizationId);

    if (status.status === "confirmed" || status.status === "failed") {
      return status;
    }

    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.5, maxDelay);
  }

  throw new Error("Transfer confirmation timeout");
}

/**
 * Backend-side: Complete zero-fee claim flow
 *
 * This function should be called from your backend after:
 * 1. User requests zero-fee claim via API
 * 2. Backend verifies the claim is valid (calls contract.verifyClaim)
 * 3. Backend signs EIP-3009 from escrow to recipient
 * 4. Backend submits to Plasma relayer
 * 5. Backend calls contract.markClaimedZeroFee
 *
 * @example
 * ```typescript
 * // In your backend API handler
 * async function handleZeroFeeClaim(req, res) {
 *   const { payrollId, commitmentIndex, amount, salt } = req.body;
 *   const recipient = req.user.address;
 *
 *   // 1. Verify claim on-chain
 *   const isValid = await contract.read.verifyClaim([
 *     payrollId, commitmentIndex, recipient, amount, salt
 *   ]);
 *   if (!isValid) throw new Error("Invalid claim");
 *
 *   // 2. Build and sign EIP-3009 from escrow
 *   const typedData = buildTransferTypedData({
 *     from: ESCROW_ADDRESS,
 *     to: recipient,
 *     value: amount,
 *   });
 *   const signature = await escrowWallet.signTypedData(typedData);
 *
 *   // 3. Submit to Plasma relayer
 *   const result = await submitZeroFeeTransfer(
 *     API_KEY, req.ip, typedData.message, signature
 *   );
 *
 *   // 4. Wait for confirmation
 *   const final = await waitForConfirmation(API_KEY, req.ip, result.authorizationId);
 *   if (final.status !== "confirmed") throw new Error("Transfer failed");
 *
 *   // 5. Mark claimed on contract
 *   await contract.write.markClaimedZeroFee([
 *     payrollId, commitmentIndex, recipient, amount, salt
 *   ]);
 *
 *   res.json({ success: true, txHash: final.txHash });
 * }
 * ```
 */
