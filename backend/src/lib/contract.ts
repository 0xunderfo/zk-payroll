/**
 * Private Payroll Contract Interactions
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

// PrivatePayroll ABI (only what we need)
const PRIVATE_PAYROLL_ABI = [
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
    name: "createPayrollRelayed",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "employer", type: "address" },
      { name: "proof", type: "uint256[8]" },
      { name: "totalAmount", type: "uint256" },
      { name: "commitments", type: "uint256[5]" },
      { name: "recipients", type: "address[5]" },
    ],
    outputs: [{ name: "payrollId", type: "uint256" }],
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

// ERC20 ABI for approve/allowance
const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

function getUsdtAddress(): Address {
  const addr = process.env.USDT_ADDRESS;
  if (!addr) {
    throw new Error("USDT_ADDRESS not set");
  }
  return addr as Address;
}

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
      abi: PRIVATE_PAYROLL_ABI,
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
    abi: PRIVATE_PAYROLL_ABI,
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
    abi: PRIVATE_PAYROLL_ABI,
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
      abi: PRIVATE_PAYROLL_ABI,
      functionName: "getPayrollInfo",
      args: [payrollId],
    });

  return { employer, totalAmount, claimedCount, claimedAmount, createdAt };
}

/**
 * Create payroll via relayed transaction (escrow already has funds)
 * Called by backend after EIP-3009 transfer is confirmed
 */
export async function createPayrollRelayed(
  employer: Address,
  proof: readonly bigint[],
  totalAmount: bigint,
  commitments: readonly bigint[],
  recipients: readonly Address[]
): Promise<{ txHash: `0x${string}`; payrollId: bigint }> {
  const { client, account } = getEscrowClient();
  const pubClient = getPublicClient();
  const contractAddress = getContractAddress();
  const usdtAddress = getUsdtAddress();

  // Check and approve USDT if needed
  const currentAllowance = await pubClient.readContract({
    address: usdtAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account.address, contractAddress],
  });

  if (currentAllowance < totalAmount) {
    console.log("[contract] Approving USDT for PrivatePayroll contract...");
    const approveTx = await client.writeContract({
      address: usdtAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [contractAddress, totalAmount * 10n], // Approve 10x to reduce future approvals
      account,
      chain: plasma,
    });
    await pubClient.waitForTransactionReceipt({ hash: approveTx });
    console.log("[contract] USDT approved:", approveTx);
  }

  // Convert to fixed-size tuples (must cast through unknown for TypeScript)
  const proofArray = [...proof.slice(0, 8)] as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
  const commitmentsArray = [...commitments.slice(0, 5)] as unknown as readonly [bigint, bigint, bigint, bigint, bigint];
  const recipientsArray = [...recipients.slice(0, 5)] as unknown as readonly [Address, Address, Address, Address, Address];

  const txHash = await client.writeContract({
    address: contractAddress,
    abi: PRIVATE_PAYROLL_ABI,
    functionName: "createPayrollRelayed",
    args: [employer, proofArray, totalAmount, commitmentsArray, recipientsArray],
    account,
    chain: plasma,
  });

  // Wait for receipt and parse payrollId from logs
  const receipt = await pubClient.waitForTransactionReceipt({ hash: txHash });

  // Parse PayrollCreated event to get payrollId
  let payrollId = 0n;
  for (const log of receipt.logs) {
    try {
      // PayrollCreated event topic: keccak256("PayrollCreated(uint256,address,uint256)")
      const eventTopic = "0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0";
      // Actually we need to decode the indexed payrollId from topics[1]
      if (log.topics[0] && log.topics[1]) {
        payrollId = BigInt(log.topics[1]);
        break;
      }
    } catch {
      // Skip logs we can't parse
    }
  }

  return { txHash, payrollId };
}
