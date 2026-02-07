/**
 * ZKPayroll Contract Interactions
 */

import {
  type Address,
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { plasma } from "./chains";

// ZKPayrollPrivate ABI (only what we need)
const ZK_PAYROLL_ABI = [
  {
    name: "verifyClaim",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "payrollId", type: "uint256" },
      { name: "commitmentIndex", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "salt", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "markClaimedZeroFee",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "payrollId", type: "uint256" },
      { name: "commitmentIndex", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "salt", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "isClaimed",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "payrollId", type: "uint256" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "getPayrollInfo",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "payrollId", type: "uint256" }],
    outputs: [
      { name: "employer", type: "address" },
      { name: "totalAmount", type: "uint256" },
      { name: "claimedCount", type: "uint256" },
      { name: "claimedAmount", type: "uint256" },
      { name: "createdAt", type: "uint256" },
    ],
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
  const addr = process.env.ZK_PAYROLL_ADDRESS;
  if (!addr) {
    throw new Error("ZK_PAYROLL_ADDRESS not set");
  }
  return addr as Address;
}

/**
 * Verify a claim is valid on-chain
 */
export async function verifyClaim(
  payrollId: bigint,
  commitmentIndex: bigint,
  recipient: Address,
  amount: bigint,
  salt: bigint
): Promise<boolean> {
  const client = getPublicClient();
  const contractAddress = getContractAddress();

  try {
    const result = await client.readContract({
      address: contractAddress,
      abi: ZK_PAYROLL_ABI,
      functionName: "verifyClaim",
      args: [payrollId, commitmentIndex, recipient, amount, salt],
    });
    return result;
  } catch (error) {
    console.error("verifyClaim error:", error);
    return false;
  }
}

/**
 * Check if a commitment has been claimed
 */
export async function isClaimed(
  payrollId: bigint,
  commitmentIndex: bigint
): Promise<boolean> {
  const client = getPublicClient();
  const contractAddress = getContractAddress();

  const result = await client.readContract({
    address: contractAddress,
    abi: ZK_PAYROLL_ABI,
    functionName: "isClaimed",
    args: [payrollId, commitmentIndex],
  });
  return result;
}

/**
 * Mark a claim as completed (called after zero-fee transfer succeeds)
 */
export async function markClaimedZeroFee(
  payrollId: bigint,
  commitmentIndex: bigint,
  recipient: Address,
  amount: bigint,
  salt: bigint
): Promise<`0x${string}`> {
  const { client, account } = getEscrowClient();
  const contractAddress = getContractAddress();

  const hash = await client.writeContract({
    address: contractAddress,
    abi: ZK_PAYROLL_ABI,
    functionName: "markClaimedZeroFee",
    args: [payrollId, commitmentIndex, recipient, amount, salt],
    account,
    chain: plasma,
  });

  return hash;
}

/**
 * Get payroll info
 */
export async function getPayrollInfo(payrollId: bigint) {
  const client = getPublicClient();
  const contractAddress = getContractAddress();

  const [employer, totalAmount, claimedCount, claimedAmount, createdAt] =
    await client.readContract({
      address: contractAddress,
      abi: ZK_PAYROLL_ABI,
      functionName: "getPayrollInfo",
      args: [payrollId],
    });

  return { employer, totalAmount, claimedCount, claimedAmount, createdAt };
}
