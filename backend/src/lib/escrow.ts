/**
 * Escrow Wallet Management
 * Handles EIP-3009 authorization signing for zero-fee claims
 */

import {
  type Address,
  type Hex,
  createWalletClient,
  http,
  type WalletClient,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { plasma } from "./chains";

// EIP-712 Domain for USDT0 on Plasma
const EIP712_DOMAIN = {
  name: "USDT0",
  version: "1",
  chainId: plasma.id,
  verifyingContract: process.env.USDT_ADDRESS as Address,
};

// EIP-3009 TransferWithAuthorization type
const TRANSFER_WITH_AUTH_TYPE = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export interface EIP3009Authorization {
  from: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
}

let escrowAccount: PrivateKeyAccount | null = null;
let escrowClient: WalletClient | null = null;

/**
 * Initialize the escrow wallet from environment
 */
export function initEscrowWallet(): { account: PrivateKeyAccount; client: WalletClient } {
  if (!escrowAccount || !escrowClient) {
    const privateKey = process.env.ESCROW_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("ESCROW_PRIVATE_KEY not set");
    }

    escrowAccount = privateKeyToAccount(privateKey as Hex);
    escrowClient = createWalletClient({
      account: escrowAccount,
      chain: plasma,
      transport: http(process.env.PLASMA_RPC_URL),
    });
  }

  return { account: escrowAccount, client: escrowClient };
}

/**
 * Get the escrow address
 */
export function getEscrowAddress(): Address {
  const { account } = initEscrowWallet();
  return account.address;
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
 * Sign an EIP-3009 authorization for a zero-fee transfer
 */
export async function signAuthorization(
  to: Address,
  value: bigint,
  validAfter: bigint = 0n,
  validBefore?: bigint,
  nonce?: Hex
): Promise<{ authorization: EIP3009Authorization; signature: Hex }> {
  const { account, client } = initEscrowWallet();

  const now = BigInt(Math.floor(Date.now() / 1000));
  const authorization: EIP3009Authorization = {
    from: account.address,
    to,
    value,
    validAfter: validAfter === 0n ? now - 60n : validAfter, // Use recent timestamp if 0
    validBefore: validBefore ?? now + 3600n, // 1 hour default
    nonce: nonce ?? generateNonce(),
  };

  const signature = await client.signTypedData({
    account,
    domain: EIP712_DOMAIN,
    types: TRANSFER_WITH_AUTH_TYPE,
    primaryType: "TransferWithAuthorization",
    message: authorization,
  });

  return { authorization, signature };
}

/**
 * Build typed data for external signing (debugging/testing)
 */
export function buildTypedData(authorization: EIP3009Authorization) {
  return {
    domain: EIP712_DOMAIN,
    types: TRANSFER_WITH_AUTH_TYPE,
    primaryType: "TransferWithAuthorization" as const,
    message: authorization,
  };
}
