/**
 * Private Payroll Pool Contract Interactions
 */

import {
  type Address,
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Hex,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { plasma } from "./chains";

const PRIVATE_PAYROLL_ABI = [
  {
    name: "registerRoot",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "root", type: "uint256" },
      { name: "batchId", type: "bytes32" },
      { name: "noteCount", type: "uint256" },
      { name: "totalAmount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "reserveZeroFeeWithdrawal",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "proof", type: "uint256[8]" },
      { name: "root", type: "uint256" },
      { name: "nullifierHash", type: "uint256" },
      { name: "requestHash", type: "uint256" },
      { name: "authorizationId", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    name: "finalizeZeroFeeWithdrawal",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "nullifierHash", type: "uint256" },
      { name: "authorizationId", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    name: "cancelReservedWithdrawal",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "nullifierHash", type: "uint256" },
      { name: "authorizationId", type: "bytes32" },
      { name: "reasonHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    name: "verifyWithdrawal",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "proof", type: "uint256[8]" },
      { name: "root", type: "uint256" },
      { name: "nullifierHash", type: "uint256" },
      { name: "requestHash", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "computeRequestHash",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "root", type: "uint256" },
      { name: "nullifierHash", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "relayer", type: "address" },
      { name: "fee", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

let publicClient: PublicClient | null = null;
let escrowClient: WalletClient | null = null;
let escrowAccount: PrivateKeyAccount | null = null;

function getPublicClient(): PublicClient {
  if (!publicClient) {
    publicClient = createPublicClient({
      chain: plasma,
      transport: http(process.env.PLASMA_RPC_URL),
    });
  }
  return publicClient;
}

function getEscrowClient(): { client: WalletClient; account: PrivateKeyAccount } {
  if (!escrowClient || !escrowAccount) {
    const privateKey = process.env.ESCROW_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("ESCROW_PRIVATE_KEY not set");
    }

    escrowAccount = privateKeyToAccount(privateKey as `0x${string}`);
    escrowClient = createWalletClient({
      account: escrowAccount,
      chain: plasma,
      transport: http(process.env.PLASMA_RPC_URL),
    });
  }
  return { client: escrowClient, account: escrowAccount };
}

function getContractAddress(): Address {
  const addr = process.env.PRIVATE_PAYROLL_ADDRESS;
  if (!addr) {
    throw new Error("PRIVATE_PAYROLL_ADDRESS not set");
  }
  return addr as Address;
}

function toProofTuple(proof: readonly bigint[]) {
  return [...proof.slice(0, 8)] as unknown as readonly [
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint
  ];
}

export async function registerRootOnChain(
  root: bigint,
  batchId: Hex,
  noteCount: number,
  totalAmount: bigint
): Promise<`0x${string}`> {
  const { client, account } = getEscrowClient();
  const contractAddress = getContractAddress();

  return client.writeContract({
    address: contractAddress,
    abi: PRIVATE_PAYROLL_ABI,
    functionName: "registerRoot",
    args: [root, batchId, BigInt(noteCount), totalAmount],
    account,
    chain: plasma,
  });
}

export async function reserveZeroFeeWithdrawalOnChain(
  proof: readonly bigint[],
  root: bigint,
  nullifierHash: bigint,
  requestHash: bigint,
  authorizationIdHash: Hex
): Promise<`0x${string}`> {
  const { client, account } = getEscrowClient();
  const contractAddress = getContractAddress();

  return client.writeContract({
    address: contractAddress,
    abi: PRIVATE_PAYROLL_ABI,
    functionName: "reserveZeroFeeWithdrawal",
    args: [toProofTuple(proof), root, nullifierHash, requestHash, authorizationIdHash],
    account,
    chain: plasma,
  });
}

export async function finalizeZeroFeeWithdrawalOnChain(
  nullifierHash: bigint,
  authorizationIdHash: Hex
): Promise<`0x${string}`> {
  const { client, account } = getEscrowClient();
  const contractAddress = getContractAddress();

  return client.writeContract({
    address: contractAddress,
    abi: PRIVATE_PAYROLL_ABI,
    functionName: "finalizeZeroFeeWithdrawal",
    args: [nullifierHash, authorizationIdHash],
    account,
    chain: plasma,
  });
}

export async function cancelReservedWithdrawalOnChain(
  nullifierHash: bigint,
  authorizationIdHash: Hex,
  reasonHash: Hex
): Promise<`0x${string}`> {
  const { client, account } = getEscrowClient();
  const contractAddress = getContractAddress();

  return client.writeContract({
    address: contractAddress,
    abi: PRIVATE_PAYROLL_ABI,
    functionName: "cancelReservedWithdrawal",
    args: [nullifierHash, authorizationIdHash, reasonHash],
    account,
    chain: plasma,
  });
}

export async function verifyWithdrawalOnChain(
  proof: readonly bigint[],
  root: bigint,
  nullifierHash: bigint,
  requestHash: bigint
): Promise<boolean> {
  const client = getPublicClient();
  const contractAddress = getContractAddress();
  try {
    return await client.readContract({
      address: contractAddress,
      abi: PRIVATE_PAYROLL_ABI,
      functionName: "verifyWithdrawal",
      args: [toProofTuple(proof), root, nullifierHash, requestHash],
    });
  } catch (error) {
    console.error("[contract] verifyWithdrawal error:", error);
    return false;
  }
}

export async function computeRequestHashOnChain(
  root: bigint,
  nullifierHash: bigint,
  recipient: Address,
  relayer: Address,
  fee: bigint,
  amount: bigint
): Promise<bigint> {
  const client = getPublicClient();
  const contractAddress = getContractAddress();
  return client.readContract({
    address: contractAddress,
    abi: PRIVATE_PAYROLL_ABI,
    functionName: "computeRequestHash",
    args: [root, nullifierHash, recipient, relayer, fee, amount],
  });
}

export async function waitForReceipt(hash: `0x${string}`) {
  return getPublicClient().waitForTransactionReceipt({ hash });
}
